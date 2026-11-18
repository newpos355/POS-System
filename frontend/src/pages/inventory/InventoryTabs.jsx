import React from 'react';
import { NavLink } from 'react-router-dom';

// Links the inventory-family pages under the one "Inventory" sidebar entry,
// same pattern as the fulfillment hub's tabs.
const TABS = [
  { path: '/inventory', label: 'Stock' },
  { path: '/tracking', label: 'Serials & Batches' },
  { path: '/price-lists', label: 'Price Lists' },
];

const InventoryTabs = () => (
  <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
    {TABS.map(tab => (
      <NavLink
        key={tab.path}
        to={tab.path}
        end
        className={({ isActive }) => `btn btn-sm ${isActive ? 'btn-primary' : 'btn-outline'}`}
      >
        {tab.label}
      </NavLink>
    ))}
  </div>
);

export default InventoryTabs;
