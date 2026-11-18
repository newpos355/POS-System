import React from 'react';

const Badge = ({ variant = 'default', children, className = '' }) => {
  const badgeClass = `badge badge-${variant}`;
  
  return (
    <span className={`${badgeClass} ${className}`.trim()}>
      {children}
    </span>
  );
};

export default Badge;
