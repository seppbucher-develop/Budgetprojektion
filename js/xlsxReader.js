// Minimaler, abhängigkeitsfreier XLSX-Reader für den einmaligen Import.
// xlsx-Dateien sind ZIP-Archive mit XML-Inhalten (OOXML). Da wir nur die
// Zellwerte zweier bekannter Blätter brauchen, genügt ein schlanker
// ZIP-Reader (DEFLATE via Compression Streams API) + DOMParser für die XML-Teile,
// statt eine externe Bibliothek einzubinden (keine Laufzeit-Netzwerkabhängigkeit).

async function readZipEntries(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);

  // End Of Central Directory Record (Signature 0x06054b50) vom Ende her suchen
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= 0 && i >= bytes.length - 22 - 65557; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error("Keine gültige ZIP/XLSX-Datei erkannt.");

  const entryCount = view.getUint16(eocdOffset + 10, true);
  const centralDirOffset = view.getUint32(eocdOffset + 16, true);

  const entries = {};
  let offset = centralDirOffset;
  for (let i = 0; i < entryCount; i++) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x02014b50) break;
    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const nameBytes = bytes.subarray(offset + 46, offset + 46 + fileNameLength);
    const fileName = new TextDecoder("utf-8").decode(nameBytes);

    entries[fileName] = { compressionMethod, compressedSize, localHeaderOffset };
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return { entries, bytes };
}

async function extractEntry(zip, fileName) {
  const entry = zip.entries[fileName];
  if (!entry) return null;
  const view = new DataView(zip.bytes.buffer, zip.bytes.byteOffset, zip.bytes.byteLength);
  const lh = entry.localHeaderOffset;
  const fileNameLength = view.getUint16(lh + 26, true);
  const extraLength = view.getUint16(lh + 28, true);
  const dataStart = lh + 30 + fileNameLength + extraLength;
  const compressed = zip.bytes.subarray(dataStart, dataStart + entry.compressedSize);

  let raw;
  if (entry.compressionMethod === 0) {
    raw = compressed;
  } else if (entry.compressionMethod === 8) {
    const ds = new DecompressionStream("deflate-raw");
    const stream = new Blob([compressed]).stream().pipeThrough(ds);
    raw = new Uint8Array(await new Response(stream).arrayBuffer());
  } else {
    throw new Error("Nicht unterstützte ZIP-Komprimierung: " + entry.compressionMethod);
  }
  return new TextDecoder("utf-8").decode(raw);
}

function colLetterToIndex(letters) {
  let idx = 0;
  for (let i = 0; i < letters.length; i++) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return idx - 1;
}

function parseSharedStrings(xmlStr) {
  if (!xmlStr) return [];
  const doc = new DOMParser().parseFromString(xmlStr, "application/xml");
  const items = Array.from(doc.getElementsByTagName("si"));
  return items.map(function (si) {
    const texts = Array.from(si.getElementsByTagName("t")).map(function (t) { return t.textContent; });
    return texts.join("");
  });
}

function parseSheetRows(xmlStr, sharedStrings) {
  const doc = new DOMParser().parseFromString(xmlStr, "application/xml");
  const rowEls = Array.from(doc.getElementsByTagName("row"));
  const rows = [];
  rowEls.forEach(function (rowEl) {
    const rowIndex = parseInt(rowEl.getAttribute("r"), 10) - 1;
    const row = [];
    Array.from(rowEl.getElementsByTagName("c")).forEach(function (c) {
      const ref = c.getAttribute("r") || "";
      const match = /^([A-Z]+)(\d+)$/.exec(ref);
      const colIndex = match ? colLetterToIndex(match[1]) : row.length;
      const type = c.getAttribute("t");
      const vEl = c.getElementsByTagName("v")[0];
      let value = null;
      if (type === "inlineStr") {
        const isEl = c.getElementsByTagName("is")[0];
        value = isEl ? isEl.textContent : "";
      } else if (vEl) {
        const raw = vEl.textContent;
        if (type === "s") {
          value = sharedStrings[parseInt(raw, 10)];
        } else if (type === "b") {
          value = raw === "1";
        } else {
          value = raw === "" ? null : parseFloat(raw);
        }
      }
      row[colIndex] = value;
    });
    rows[rowIndex] = row;
  });
  return rows;
}

/**
 * Liest die angegebenen Arbeitsblätter aus einer xlsx-Datei.
 * @param {ArrayBuffer} arrayBuffer
 * @param {string[]} sheetNames gewünschte Blattnamen (exakt wie im Workbook)
 * @returns {Promise<Object<string, Array<Array>>>} Zeilen je Blattname (0-indexiert, sparse)
 */
export async function readXlsxSheets(arrayBuffer, sheetNames) {
  const zip = await readZipEntries(arrayBuffer);

  const workbookXml = await extractEntry(zip, "xl/workbook.xml");
  const relsXml = await extractEntry(zip, "xl/_rels/workbook.xml.rels");
  const sharedStringsXml = await extractEntry(zip, "xl/sharedStrings.xml");
  if (!workbookXml || !relsXml) throw new Error("xlsx-Struktur nicht erkannt (workbook.xml fehlt).");

  const sharedStrings = parseSharedStrings(sharedStringsXml);

  const wbDoc = new DOMParser().parseFromString(workbookXml, "application/xml");
  const relsDoc = new DOMParser().parseFromString(relsXml, "application/xml");

  const relTargetById = {};
  Array.from(relsDoc.getElementsByTagName("Relationship")).forEach(function (rel) {
    relTargetById[rel.getAttribute("Id")] = rel.getAttribute("Target");
  });

  const result = {};
  Array.from(wbDoc.getElementsByTagName("sheet")).forEach(function (sheetEl) {
    const name = sheetEl.getAttribute("name");
    if (sheetNames.indexOf(name) === -1) return;
    const rId = sheetEl.getAttribute("r:id") || sheetEl.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    const target = relTargetById[rId];
    if (!target) return;
    const path = target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\.?\//, "");
    result[name] = { path: path, name: name };
  });

  for (const name of Object.keys(result)) {
    const sheetXml = await extractEntry(zip, result[name].path);
    result[name] = parseSheetRows(sheetXml, sharedStrings);
  }

  return result;
}
