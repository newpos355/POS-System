import React from 'react';
import { FiTrendingUp, FiTrendingDown, FiMinus } from 'react-icons/fi';

const StatCard = ({ title, value, icon: Icon, trend, trendValue, color = 'primary' }) => {
  let TrendIcon = FiMinus;
  let trendClass = 'neutral';
  
  if (trend === 'up') {
    TrendIcon = FiTrendingUp;
    trendClass = 'up';
  } else if (trend === 'down') {
    TrendIcon = FiTrendingDown;
    trendClass = 'down';
  }

  return (
    <div className="stat-card">
      <div className="stat-content">
        <h3 className="stat-title">{title}</h3>
        <div className="stat-value">{value}</div>
        
        {trendValue && (
          <div className={`stat-trend ${trendClass}`}>
            <TrendIcon size={16} />
            <span>{trendValue}</span>
          </div>
        )}
      </div>
      
      {Icon && (
        <div className={`stat-icon bg-${color}-light text-${color}`}>
          <Icon size={24} />
        </div>
      )}
    </div>
  );
};

export default StatCard;
