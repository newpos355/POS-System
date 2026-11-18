// Tenant-scoped document numbering with a collision loop — the same pattern
// salesController uses inline for SO-{year}-#### numbers, extracted so every
// new document type (PL/SH/WB/CN...) doesn't grow its own slightly-different
// copy. Uniqueness is enforced by each model's {tenantId, <field>} compound
// index; the loop here just avoids burning a request on an E11000 in the
// common case.
async function nextDocNumber(Model, tenantId, prefix, field) {
  const count = await Model.countDocuments({ tenantId });
  const last = await Model.findOne({ tenantId }).sort('-createdAt').select(field);

  let nextNum = count + 1;
  const lastVal = last?.[field];
  if (lastVal) {
    const parts = String(lastVal).split('-');
    const lastNum = parseInt(parts[parts.length - 1] || '0', 10);
    if (!isNaN(lastNum) && lastNum >= nextNum) nextNum = lastNum + 1;
  }

  const year = new Date().getFullYear();
  let docNumber = `${prefix}-${year}-${String(nextNum).padStart(4, '0')}`;
  while (await Model.exists({ tenantId, [field]: docNumber })) {
    nextNum += 1;
    docNumber = `${prefix}-${year}-${String(nextNum).padStart(4, '0')}`;
  }
  return docNumber;
}

module.exports = { nextDocNumber };
