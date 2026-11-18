import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiBell, FiX, FiCheck, FiTrash2, FiCheckCircle, FiAlertTriangle, FiAlertOctagon, FiShoppingCart, FiPackage, FiUsers, FiDollarSign, FiInfo } from 'react-icons/fi';
import { useNotifications } from '../../contexts/NotificationContext';
import './NotificationPanel.css';

const TYPE_CONFIG = {
  low_stock:        { icon: FiAlertTriangle,  color: '#F59E0B', bg: '#FFFBEB', label: 'Low Stock' },
  out_of_stock:     { icon: FiAlertOctagon,   color: '#EF4444', bg: '#FEF2F2', label: 'Out of Stock' },
  new_sale:         { icon: FiShoppingCart,   color: '#16A34A', bg: '#F0FDF4', label: 'New Sale' },
  new_purchase:     { icon: FiPackage,        color: '#3B82F6', bg: '#EFF6FF', label: 'Purchase' },
  new_customer:     { icon: FiUsers,          color: '#8B5CF6', bg: '#F5F3FF', label: 'New Customer' },
  payment_received: { icon: FiDollarSign,     color: '#10B981', bg: '#ECFDF5', label: 'Payment' },
  system:           { icon: FiInfo,           color: '#64748B', bg: '#F8FAFC', label: 'System' },
  alert:            { icon: FiAlertTriangle,  color: '#F97316', bg: '#FFF7ED', label: 'Alert' },
};

const PRIORITY_COLORS = {
  critical: '#EF4444',
  high:     '#F59E0B',
  medium:   '#3B82F6',
  low:      '#94A3B8',
};

const timeAgo = (dateStr) => {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

const NotificationPanel = () => {
  const navigate = useNavigate();
  const panelRef = useRef(null);
  const {
    notifications,
    unreadCount,
    loading,
    panelOpen,
    closePanel,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearRead,
  } = useNotifications();

  // Close on outside click
  useEffect(() => {
    if (!panelOpen) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        // Only close if click is not on the bell button
        if (!e.target.closest('.notif-bell-btn')) closePanel();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [panelOpen, closePanel]);

  const handleNotifClick = (notif) => {
    if (!notif.isRead) markAsRead(notif._id);
    if (notif.actionUrl) {
      navigate(notif.actionUrl);
      closePanel();
    }
  };

  if (!panelOpen) return null;

  return (
    <div className="notif-panel" ref={panelRef}>
      {/* Header */}
      <div className="notif-header">
        <div className="notif-header-left">
          <FiBell className="notif-header-icon" />
          <span className="notif-header-title">Notifications</span>
          {unreadCount > 0 && (
            <span className="notif-header-badge">{unreadCount}</span>
          )}
        </div>
        <div className="notif-header-actions">
          {unreadCount > 0 && (
            <button className="notif-action-btn" onClick={markAllAsRead} title="Mark all as read">
              <FiCheckCircle /> All Read
            </button>
          )}
          <button className="notif-action-btn danger" onClick={clearRead} title="Clear read notifications">
            <FiTrash2 /> Clear
          </button>
          <button className="notif-close-btn" onClick={closePanel}>
            <FiX />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="notif-body">
        {loading ? (
          <div className="notif-empty">
            <div className="notif-spinner" />
            <p>Loading…</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="notif-empty">
            <FiBell className="notif-empty-icon" />
            <p>All caught up!</p>
            <span>No notifications yet</span>
          </div>
        ) : (
          <ul className="notif-list">
            {notifications.map(notif => {
              const cfg = TYPE_CONFIG[notif.type] || TYPE_CONFIG.system;
              const Icon = cfg.icon;
              return (
                <li
                  key={notif._id}
                  className={`notif-item ${!notif.isRead ? 'unread' : ''}`}
                  onClick={() => handleNotifClick(notif)}
                >
                  {/* Priority strip */}
                  <div
                    className="notif-priority-strip"
                    style={{ background: PRIORITY_COLORS[notif.priority] || '#94A3B8' }}
                  />

                  {/* Icon */}
                  <div className="notif-icon-wrapper" style={{ background: cfg.bg }}>
                    <Icon style={{ color: cfg.color, width: 16, height: 16 }} />
                  </div>

                  {/* Content */}
                  <div className="notif-content">
                    <span className="notif-title">{notif.title}</span>
                    <span className="notif-message">{notif.message}</span>
                    <span className="notif-time">{timeAgo(notif.createdAt)}</span>
                  </div>

                  {/* Unread dot + actions */}
                  <div className="notif-right">
                    {!notif.isRead && <span className="notif-unread-dot" />}
                    <div className="notif-item-actions">
                      {!notif.isRead && (
                        <button
                          className="notif-item-btn"
                          title="Mark as read"
                          onClick={e => { e.stopPropagation(); markAsRead(notif._id); }}
                        >
                          <FiCheck />
                        </button>
                      )}
                      <button
                        className="notif-item-btn danger"
                        title="Delete"
                        onClick={e => { e.stopPropagation(); deleteNotification(notif._id); }}
                      >
                        <FiX />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 && (
        <div className="notif-footer">
          <span>{notifications.length} notification{notifications.length !== 1 ? 's' : ''}</span>
        </div>
      )}
    </div>
  );
};

export default NotificationPanel;
