import React from 'react';
import { FiLoader } from 'react-icons/fi';

const Loader = ({ fullPage = false, size = 24, className = '' }) => {
  const loader = (
    <div className={`flex items-center justify-center text-primary ${className}`}>
      <FiLoader size={size} className="animate-spin" />
    </div>
  );

  if (fullPage) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm z-50">
        {loader}
      </div>
    );
  }

  return loader;
};

export default Loader;
