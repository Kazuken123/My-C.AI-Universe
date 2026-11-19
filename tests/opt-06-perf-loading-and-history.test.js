import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { load } from 'cheerio';

test('OPT-06: Frontend skeleton screens and markup are present in static HTML', () => {
  const indexHtml = fs.readFileSync('frontend/index.html', 'utf8');
  const chatHtml = fs.readFileSync('frontend/chat.html', 'utf8');
  const chatsHtml = fs.readFileSync('frontend/chats.html', 'utf8');
  const personasHtml = fs.readFileSync('frontend/personas.html', 'utf8');
  const studioHtml = fs.readFileSync('frontend/create.html', 'utf8');

  const discover = load(indexHtml);
  const shelf = discover('#discover-grid[aria-busy="true"]');
  assert.ok(shelf.find('.skeleton-shell').length >= 2,
    'the server-rendered shelf reserves space for character cards');
  assert.ok(indexHtml.includes('skeleton-avatar-box'), 'index.html has skeleton avatar boxes');

  // Verify chat.html has initial skeleton stream
  assert.ok(chatHtml.includes('chat-skeleton-stream'), 'chat.html contains initial chat-skeleton-stream');
  assert.ok(chatHtml.includes('chat-intro-skeleton'), 'chat.html contains chat-intro-skeleton');
  assert.ok(chatHtml.includes('msg-skeleton-row'), 'chat.html contains msg-skeleton-row');

  // Verify chats.html has initial skeleton cards
  const saved = load(chatsHtml);
  const savedRows = saved('#saved-chats-grid[aria-busy="true"] .atlas-saved-placeholder[aria-hidden="true"]');
  assert.ok(savedRows.length >= 2,
    'saved chats reserve individual session rows while loading');
  for (const row of savedRows) {
    assert.equal(saved(row).find('.atlas-saved-avatar.atlas-skeleton').length, 1);
    assert.equal(saved(row).find('.atlas-saved-text .atlas-skeleton').length, 3);
    assert.equal(saved(row).find('.atlas-saved-actions .atlas-skeleton').length, 2);
  }

  const studio = load(studioHtml);
  assert.equal(studio('#studio-load-status:not([hidden]) .atlas-columns > section').length, 2);
  assert.equal(studio('.studio-grid[hidden]').length, 1);

  // Verify personas.html has initial skeleton cards
  assert.ok(personasHtml.includes('skeleton-shell'), 'personas.html contains initial skeleton cards in personas-list');
});

test('OPT-06: Orbit Motion preloader hooks into rail-next, rail-prev, and track scroll', () => {
  const orbitMotionJs = fs.readFileSync('frontend/js/orbit-motion.js', 'utf8');
  assert.ok(orbitMotionJs.includes('preloadUpcomingCards'), 'orbit-motion.js defines preloadUpcomingCards');
  assert.ok(orbitMotionJs.includes('next.addEventListener(\'pointerenter\', preloadUpcomingCards'), 'next button has pointerenter preloader');
  assert.ok(orbitMotionJs.includes('next.addEventListener(\'focus\', preloadUpcomingCards'), 'next button has focus preloader');
  assert.ok(orbitMotionJs.includes('loading = \'eager\''), 'preloader upgrades images from lazy to eager');
  assert.ok(orbitMotionJs.includes('pre.decode()'), 'preloader uses browser Image decode for GPU rasterization');
});

test('OPT-06: Chat module defines lazy message windowing and reverse infinite scroll', () => {
  const chatJs = fs.readFileSync('frontend/js/chat.js', 'utf8');
  assert.ok(chatJs.includes('CHAT_PAGE_SIZE = 20'), 'chat.js defines CHAT_PAGE_SIZE of 20 turns');
  assert.ok(chatJs.includes('renderChatSkeleton'), 'chat.js defines renderChatSkeleton for immediate visual feedback');
  assert.ok(chatJs.includes('chat-history-loader'), 'chat.js contains chat-history-loader');
  assert.ok(chatJs.includes('loadOlderMessages'), 'chat.js implements loadOlderMessages');
  assert.ok(chatJs.includes('prevScrollHeight'), 'loadOlderMessages preserves scroll anchoring via scrollDelta');
  assert.ok(chatJs.includes('scrollWrap.scrollTop <= 120'), 'chat.js auto-triggers loadOlderMessages when scrolling near top');
});

test('OPT-06: Dashboard implements buildSkeletonCards and preloadCharacterAvatars', () => {
  const dashboardJs = fs.readFileSync('frontend/js/dashboard.js', 'utf8');
  assert.ok(dashboardJs.includes('buildSkeletonCards'), 'dashboard.js has buildSkeletonCards helper');
  assert.ok(dashboardJs.includes('preloadCharacterAvatars'), 'dashboard.js has preloadCharacterAvatars helper');
  assert.ok(dashboardJs.includes('data-rail-next'), 'dashboard.js hooks rail-next pointerenter to preload remaining avatars');
});
