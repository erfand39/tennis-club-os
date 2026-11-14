'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { type ResourceSearchItem, resourceKinds, resourcePath } from '@/lib/resource-fields';
import { formatSearchMeta } from '@/lib/resource-search';

export function ClubSearch({ org }: { org: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ResourceSearchItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const trimmed = query.trim();

  useEffect(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, [pathname]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    const onShortcut = (event: globalThis.KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      event.preventDefault();
      if (window.innerWidth <= 840) {
        window.dispatchEvent(new CustomEvent('sam:open-club-search'));
      } else {
        inputRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onShortcut);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onShortcut);
    };
  }, []);

  useEffect(() => {
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      setFailed(false);
      setActiveIndex(-1);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ org, q: trimmed });
        const response = await fetch(`/api/resource-search?${params}`, {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('search_failed');
        const data = (await response.json()) as { results?: ResourceSearchItem[] };
        if (controller.signal.aborted) return;
        const next = Array.isArray(data.results) ? data.results : [];
        setResults(next);
        setActiveIndex(next.length ? 0 : -1);
      } catch (error) {
        if ((error as { name?: string }).name === 'AbortError') return;
        setResults([]);
        setFailed(true);
        setActiveIndex(-1);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [org, trimmed]);

  const showPanel = open && trimmed.length > 0;

  function selectItem(item: ResourceSearchItem) {
    setOpen(false);
    setActiveIndex(-1);
    window.dispatchEvent(new CustomEvent('sam:close-club-drawer'));
    router.push(resourcePath(org, item.kind, item.id));
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      if (open) {
        setOpen(false);
        setActiveIndex(-1);
      } else if (query) {
        setQuery('');
      }
      return;
    }
    if (!results.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(current => (current + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(current => (current <= 0 ? results.length - 1 : current - 1));
    } else if (event.key === 'Enter' && showPanel) {
      const target = results[activeIndex >= 0 ? activeIndex : 0];
      if (target) {
        event.preventDefault();
        selectItem(target);
      }
    }
  }

  return <div className="club-search" ref={containerRef}>
    <label className="club-search-field">
      <span className="club-search-label">جست‌وجوی سریع</span>
      <div className="club-search-box">
        <input
          ref={inputRef}
          type="search"
          className="club-search-input"
          value={query}
          maxLength={100}
          placeholder="شاگرد، مربی یا زمین…"
          aria-label="جست‌وجوی شاگرد، مربی یا زمین"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showPanel}
          aria-controls={listboxId}
          aria-activedescendant={showPanel && activeIndex >= 0 && results[activeIndex] ? `${listboxId}-${activeIndex}` : undefined}
          onFocus={() => { if (trimmed) setOpen(true); }}
          onChange={event => {
            setQuery(event.currentTarget.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        {query && <button
          type="button"
          className="club-search-clear"
          aria-label="پاک‌کردن جست‌وجو"
          onClick={() => {
            setQuery('');
            setResults([]);
            setOpen(false);
            inputRef.current?.focus();
          }}
        >×</button>}
      </div>
    </label>
    {showPanel && <div id={listboxId} role="listbox" className="club-search-results" aria-label="نتایج جست‌وجو">
      {loading && <p className="club-search-empty">در حال جست‌وجو…</p>}
      {!loading && failed && <p className="club-search-empty">امکان جست‌وجو برقرار نشد.</p>}
      {!loading && !failed && !results.length && <p className="club-search-empty">پرونده‌ای با این نام پیدا نشد.</p>}
      {!loading && !failed && results.map((item, index) => {
        const meta = formatSearchMeta(item);
        return <Link
          key={`${item.kind}-${item.id}`}
          id={`${listboxId}-${index}`}
          role="option"
          aria-selected={index === activeIndex}
          className={index === activeIndex ? 'club-search-option is-active' : 'club-search-option'}
          href={resourcePath(org, item.kind, item.id)}
          onMouseEnter={() => setActiveIndex(index)}
          onClick={() => {
            setOpen(false);
            setActiveIndex(-1);
            window.dispatchEvent(new CustomEvent('sam:close-club-drawer'));
          }}
        >
          <span className="club-search-option-head">
            <strong>{item.name}</strong>
            <span className="club-search-kind">{resourceKinds[item.kind].label}</span>
          </span>
          {meta && <small>{meta}</small>}
        </Link>;
      })}
    </div>}
  </div>;
}
