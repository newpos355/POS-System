import React from 'react';
import Loader from './Loader';
import EmptyState from './EmptyState';

const Table = ({
  columns,
  data,
  loading = false,
  emptyMessage = 'No data available',
  onRowClick,
}) => {
  if (loading) {
    return (
      <div className="table-container p-8 flex justify-center">
        <Loader />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="table-container p-8">
        <EmptyState title="No Records Found" description={emptyMessage} />
      </div>
    );
  }

  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            {columns.map((col, idx) => (
              <th key={idx} className={col.align ? `text-${col.align}` : ''}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIdx) => (
            <tr
              key={row.id || rowIdx}
              onClick={() => onRowClick && onRowClick(row)}
              style={{ cursor: onRowClick ? 'pointer' : 'default' }}
            >
              {columns.map((col, colIdx) => (
                <td key={colIdx} className={col.align ? `text-${col.align}` : ''}>
                  {col.render ? col.render(row[col.key], row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default Table;
