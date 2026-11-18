import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { NotificationsAPI } from '../services/api';
import { useAuth } from './AuthContext';

const NotificationContext = createContext(null);

export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used inside NotificationProvider');
  return ctx;
};

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const { user } = useAuth();
  const pollRef = useRef(null);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const res = await NotificationsAPI.getNotifications({ limit: 50 });
      if (res.data?.success) {
        setNotifications(res.data.data || []);
        setUnreadCount(res.data.unreadCount || 0);
      }
    } catch {
      // Silently fail — notifications are non-critical
    } finally {
      setLoading(false);
    }
  }, [user]);

  const fetchUnreadCount = useCallback(async () => {
    if (!user) return;
    try {
      const res = await NotificationsAPI.getUnreadCount();
      if (res.data?.success) {
        setUnreadCount(res.data.data?.unreadCount || 0);
      }
    } catch {
      // Silently fail
    }
  }, [user]);

  // Initial fetch + polling every 30s for new notifications
  useEffect(() => {
    if (!user) return;
    fetchNotifications();
    pollRef.current = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(pollRef.current);
  }, [user, fetchNotifications, fetchUnreadCount]);

  const markAsRead = useCallback(async (id) => {
    try {
      await NotificationsAPI.markAsRead(id);
      setNotifications(prev =>
        prev.map(n => n._id === id ? { ...n, isRead: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error(err);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      await NotificationsAPI.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const deleteNotification = useCallback(async (id) => {
    try {
      await NotificationsAPI.deleteNotification(id);
      // Functional update so this callback doesn't need `notifications` in
      // its dependency array (which would give it — and every consumer that
      // depends on it — a new identity on every notification change).
      let wasUnread = false;
      setNotifications(prev => {
        const notif = prev.find(n => n._id === id);
        wasUnread = !!notif && !notif.isRead;
        return prev.filter(n => n._id !== id);
      });
      if (wasUnread) setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error(err);
    }
  }, []);

  const clearRead = useCallback(async () => {
    try {
      await NotificationsAPI.clearRead();
      setNotifications(prev => prev.filter(n => !n.isRead));
    } catch (err) {
      console.error(err);
    }
  }, []);

  const openPanel = useCallback(() => {
    setPanelOpen(true);
    fetchNotifications();
  }, [fetchNotifications]);

  const closePanel = useCallback(() => setPanelOpen(false), []);
  const togglePanel = useCallback(() => {
    setPanelOpen(prev => {
      const next = !prev;
      if (next) fetchNotifications();
      return next;
    });
  }, [fetchNotifications]);

  const value = useMemo(() => ({
    notifications,
    unreadCount,
    loading,
    panelOpen,
    togglePanel,
    openPanel,
    closePanel,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearRead,
  }), [notifications, unreadCount, loading, panelOpen, togglePanel, openPanel, closePanel, fetchNotifications, markAsRead, markAllAsRead, deleteNotification, clearRead]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};
