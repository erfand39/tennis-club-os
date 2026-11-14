'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from './icon';
import { Logout } from '../ui';
import { resourcePath } from '@/lib/resource-fields';

export interface BottomNavProps {
  org: string;
  userName?: string;
  roleTitle?: string;
  isOwner?: boolean;
}

export function BottomNav({ org, userName, roleTitle, isOwner }: BottomNavProps) {
  const pathname = usePathname();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Close drawer when route changes
  useEffect(() => {
    setIsDrawerOpen(false);
  }, [pathname]);

  // Handle Escape key and body scroll lock
  useEffect(() => {
    if (isDrawerOpen) {
      document.body.style.overflow = 'hidden';
      closeBtnRef.current?.focus();
    } else {
      document.body.style.overflow = '';
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isDrawerOpen) {
        setIsDrawerOpen(false);
        triggerRef.current?.focus();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDrawerOpen]);

  const navItems = [
    {
      href: `/club/${org}/calendar`,
      label: 'تقویم',
      icon: 'calendar' as const,
      active: pathname.startsWith(`/club/${org}/calendar`),
    },
    {
      href: `/club/${org}/classes`,
      label: 'کلاس‌ها',
      icon: 'clock' as const,
      active: pathname.startsWith(`/club/${org}/classes`),
    },
    {
      href: `/club/${org}/finance`,
      label: 'امور مالی',
      icon: 'credit-card' as const,
      active: pathname.startsWith(`/club/${org}/finance`),
    },
    {
      href: resourcePath(org, 'courts'),
      label: 'امکانات/اعضا',
      icon: 'court' as const,
      active: pathname.startsWith(`/club/${org}/resources`),
    },
  ];

  const isMoreActive =
    !navItems.some(item => item.active) &&
    (pathname === `/club/${org}` ||
      pathname.startsWith(`/club/${org}/reports`) ||
      pathname.startsWith(`/club/${org}/notifications`) ||
      pathname.startsWith(`/club/${org}/members`) ||
      pathname.startsWith(`/club/${org}/profile`));

  return (
    <>
      <nav className="mobile-bottom-nav" aria-label="ناوبری همراه باشگاه">
        {navItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`mobile-nav-item ${item.active ? 'is-active' : ''}`}
            aria-current={item.active ? 'page' : undefined}
          >
            <Icon name={item.icon} size={22} aria-hidden={true} />
            <span>{item.label}</span>
          </Link>
        ))}

        <button
          ref={triggerRef}
          type="button"
          className={`mobile-nav-item ${isMoreActive || isDrawerOpen ? 'is-active' : ''}`}
          onClick={() => setIsDrawerOpen(prev => !prev)}
          aria-expanded={isDrawerOpen}
          aria-controls="mobile-more-drawer"
          aria-haspopup="dialog"
          aria-label="بیشتر (منوی امکانات)"
        >
          <Icon name="menu" size={22} aria-hidden={true} />
          <span>بیشتر</span>
        </button>
      </nav>

      {isDrawerOpen && (
        <div
          className="mobile-drawer-overlay"
          onClick={() => {
            setIsDrawerOpen(false);
            triggerRef.current?.focus();
          }}
          aria-hidden="true"
        />
      )}

      {isDrawerOpen && (
        <aside
          id="mobile-more-drawer"
          className="mobile-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="منوی دسترسی و مدیریت باشگاه"
          tabIndex={-1}
        >
          <div className="mobile-drawer-header">
            <div className="mobile-drawer-title">
              <Icon name="menu" size={20} aria-hidden={true} />
              <span>دسترسی و امکانات بیشتر</span>
            </div>
            <button
              ref={closeBtnRef}
              type="button"
              className="mobile-drawer-close"
              onClick={() => {
                setIsDrawerOpen(false);
                triggerRef.current?.focus();
              }}
              aria-label="بستن منو"
            >
              <Icon name="close" size={20} aria-hidden={true} />
            </button>
          </div>

          <div className="mobile-drawer-account">
            <div className="account-avatar">
              <Icon name="user" size={22} aria-hidden={true} />
            </div>
            <div className="account-info">
              <strong>{userName || 'حساب باشگاه'}</strong>
              <small>{roleTitle || 'عضو'}</small>
            </div>
          </div>

          <nav className="mobile-drawer-nav" aria-label="بخش‌های بیشتر سامانه">
            <div className="drawer-group">
              <span className="drawer-group-label">امکانات اصلی</span>
              <Link
                href={`/club/${org}`}
                onClick={() => setIsDrawerOpen(false)}
                className={pathname === `/club/${org}` ? 'active' : ''}
              >
                <Icon name="court" size={18} aria-hidden={true} />
                <span>نمای کلی باشگاه</span>
              </Link>
              <Link
                href={resourcePath(org, 'courts')}
                onClick={() => setIsDrawerOpen(false)}
                className={pathname.startsWith(resourcePath(org, 'courts')) ? 'active' : ''}
              >
                <Icon name="court" size={18} aria-hidden={true} />
                <span>زمین‌ها</span>
              </Link>
              <Link
                href={resourcePath(org, 'coaches')}
                onClick={() => setIsDrawerOpen(false)}
                className={pathname.startsWith(resourcePath(org, 'coaches')) ? 'active' : ''}
              >
                <Icon name="users" size={18} aria-hidden={true} />
                <span>مربیان</span>
              </Link>
              <Link
                href={resourcePath(org, 'students')}
                onClick={() => setIsDrawerOpen(false)}
                className={pathname.startsWith(resourcePath(org, 'students')) ? 'active' : ''}
              >
                <Icon name="users" size={18} aria-hidden={true} />
                <span>شاگردان</span>
              </Link>
            </div>

            <div className="drawer-group">
              <span className="drawer-group-label">گزارش‌ها و پیام‌ها</span>
              <Link
                href={`/club/${org}/reports`}
                onClick={() => setIsDrawerOpen(false)}
                className={pathname.startsWith(`/club/${org}/reports`) ? 'active' : ''}
              >
                <Icon name="dollar" size={18} aria-hidden={true} />
                <span>گزارش‌ها و آمار</span>
              </Link>
              <Link
                href={`/club/${org}/notifications`}
                onClick={() => setIsDrawerOpen(false)}
                className={pathname.startsWith(`/club/${org}/notifications`) ? 'active' : ''}
              >
                <Icon name="bell" size={18} aria-hidden={true} />
                <span>اعلان‌ها و پیام‌ها</span>
              </Link>
            </div>

            <div className="drawer-group">
              <span className="drawer-group-label">تنظیمات و حساب</span>
              {isOwner && (
                <Link
                  href={`/club/${org}/members`}
                  onClick={() => setIsDrawerOpen(false)}
                  className={pathname.startsWith(`/club/${org}/members`) ? 'active' : ''}
                >
                  <Icon name="users" size={18} aria-hidden={true} />
                  <span>مدیران و دسترسی</span>
                </Link>
              )}
              <Link
                href={`/club/${org}/profile`}
                onClick={() => setIsDrawerOpen(false)}
                className={pathname.startsWith(`/club/${org}/profile`) ? 'active' : ''}
              >
                <Icon name="user" size={18} aria-hidden={true} />
                <span>پروفایل من</span>
              </Link>
            </div>
          </nav>

          <div className="mobile-drawer-footer">
            <Logout />
          </div>
        </aside>
      )}
    </>
  );
}
