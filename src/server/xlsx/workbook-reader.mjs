import { readZipEntries } from "./zip-reader.mjs";

function xmlEntities(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function attr(xml, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(new RegExp(`(?:^|\\s)${escaped}="([^"]*)"`));
  return match ? xmlEntities(match[1]) : "";
}

function textBetween(xml, tag) {
  const result = [];
  const pattern = new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, "g");
  for (const match of xml.matchAll(pattern)) result.push(xmlEntities(match[1]));
  return result;
}

function columnIndex(cellRef) {
  const letters = String(cellRef).match(/^[A-Z]+/)?.[0] || "";
  let index = 0;
  for (const char of letters) index = index * 26 + char.charCodeAt(0) - 64;
  return index - 1;
}

function normalizeTarget(target) {
  const cleanTarget = target.replace(/^\//, "");
  return cleanTarget.startsWith("xl/") ? cleanTarget : `xl/${cleanTarget}`;
}

function parseSharedStrings(entries) {
  const xml = entries.get("xl/sharedStrings.xml");
  if (!xml) return [];
  return [...xml.toString("utf8").matchAll(/<si[\s\S]*?<\/si>/g)].map((match) => {
    return textBetween(match[0], "t").join("");
  });
}

function parseRelationships(xml) {
  const relationships = new Map();
  for (const match of xml.matchAll(/<Relationship\b[^>]*>/g)) {
    const node = match[0];
    relationships.set(attr(node, "Id"), attr(node, "Target"));
  }
  return relationships;
}

function parseCell(cellXml, sharedStrings) {
  const type = attr(cellXml, "t");
  if (type === "s") {
    const value = textBetween(cellXml, "v")[0];
    return sharedStrings[Number(value)] ?? "";
  }
  if (type === "inlineStr") {
    return textBetween(cellXml, "t").join("");
  }
  return textBetween(cellXml, "v")[0] ?? "";
}

function parseSheet(xml, sharedStrings) {
  const rows = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>[\s\S]*?<\/row>/g)) {
    const rowXml = rowMatch[0];
    const values = [];
    for (const cellMatch of rowXml.matchAll(/<c\b[^>]*(?:>[\s\S]*?<\/c>|\/>)/g)) {
      const cellXml = cellMatch[0];
      values[columnIndex(attr(cellXml, "r"))] = parseCell(cellXml, sharedStrings);
    }
    rows.push(Array.from({ length: values.length }, (_, index) => values[index] ?? ""));
  }
  const headers = rows[0] ?? [];
  return { headers, rows: rows.slice(1) };
}

export function readWorkbook(buffer) {
  const entries = readZipEntries(buffer);
  const workbookXml = entries.get("xl/workbook.xml")?.toString("utf8");
  const relsXml = entries.get("xl/_rels/workbook.xml.rels")?.toString("utf8");
  if (!workbookXml || !relsXml) throw new Error("Invalid xlsx file: workbook metadata missing");

  const sharedStrings = parseSharedStrings(entries);
  const relationships = parseRelationships(relsXml);
  const sheets = [];

  for (const match of workbookXml.matchAll(/<sheet\b[^>]*>/g)) {
    const node = match[0];
    const name = attr(node, "name");
    const id = attr(node, "r:id");
    const target = relationships.get(id);
    if (!target) continue;
    const xml = entries.get(normalizeTarget(target))?.toString("utf8");
    if (xml) sheets.push({ name, ...parseSheet(xml, sharedStrings) });
  }

  return { sheetNames: sheets.map((sheet) => sheet.name), sheets };
}
