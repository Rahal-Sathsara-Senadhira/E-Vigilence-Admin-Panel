export function toId(doc) {
  if (!doc) return null;

  // If it's a mongoose doc, convert to plain object
  const obj = typeof doc.toObject === "function" ? doc.toObject() : doc;

  if (obj._id) {
    obj.id = String(obj._id);
    delete obj._id;
  }
  return obj;
}

export function toIds(docs) {
  if (!Array.isArray(docs)) return [];
  return docs.map(toId);
}
