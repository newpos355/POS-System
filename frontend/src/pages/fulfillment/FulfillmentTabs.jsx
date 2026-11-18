import React from 'react';
import { NavLink } from 'react-router-dom';

// Shared tab strip linking the four fulfillment pages, so one "Shipments"
// sidebar entry gives access to all of them.
const TABS = [
  { path: '/shipments', label: 'Shipments' },
  { path: '/picklists', label: 'Picklists' },
  { path: '/backorders', label: 'Backorders' },
  { path: '/waybills', label: 'Waybills' },
];

const FulfillmentTabs = () => (
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

export default FulfillmentTabs;
