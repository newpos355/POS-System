// The branch picker stores the sentinel 'all' when "All Branches" is
// selected. List/query endpoints ignore it server-side (it's not a valid
// ObjectId), but create payloads (sales, held bills, shifts, purchases)
// must never send it — they need a real branch id or nothing.
export const getActiveBranchId = () => {
  const id = localStorage.getItem('active_branch_id');
  return id && id !== 'all' ? id : null;
};
