/*
 * 觀星者之屋 — 存檔
 * localStorage 可能被封鎖或清空（私密視窗、嵌入預覽），所以每次讀寫都包在 try/catch 裡，
 * 失敗時退回記憶體存檔，並提供「存檔碼」讓玩家把進度帶走或帶回來。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SaveStore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PREFIX = 'stargazer.v1.';
  const memory = {};

  function probe() {
    try {
      const ls = (typeof localStorage !== 'undefined') ? localStorage : null;
      if (!ls) return null;
      const k = PREFIX + '__probe';
      ls.setItem(k, '1');
      ls.removeItem(k);
      return ls;
    } catch (e) { return null; }
  }
  let ls = probe();

  function rawGet(key) {
    if (ls) { try { const v = ls.getItem(PREFIX + key); if (v !== null) return v; } catch (e) { ls = null; } }
    return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
  }
  function rawSet(key, value) {
    memory[key] = value;
    if (ls) { try { ls.setItem(PREFIX + key, value); return true; } catch (e) { ls = null; } }
    return false;
  }
  function rawDel(key) {
    delete memory[key];
    if (ls) { try { ls.removeItem(PREFIX + key); } catch (e) { ls = null; } }
  }

  function read(slot) {
    const raw = rawGet('slot.' + slot);
    if (!raw) return null;
    try {
      const rec = JSON.parse(raw);
      return rec && rec.state ? rec : null;
    } catch (e) { return { corrupt: true }; }
  }
  function write(slot, rec) { return rawSet('slot.' + slot, JSON.stringify(rec)); }
  function remove(slot) { rawDel('slot.' + slot); }

  function getEndings() {
    try { const v = JSON.parse(rawGet('endings') || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function addEnding(id) {
    const list = getEndings();
    if (!list.includes(id)) { list.push(id); rawSet('endings', JSON.stringify(list)); }
    return list;
  }

  // 存檔碼：STAR1.<base64(UTF-8 JSON)>.<校驗碼>
  function checksum(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }
  function toB64(str) {
    if (typeof Buffer !== 'undefined') return Buffer.from(str, 'utf8').toString('base64');
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  }
  function fromB64(b64) {
    if (typeof Buffer !== 'undefined') return Buffer.from(b64, 'base64').toString('utf8');
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function encode(state) {
    const json = JSON.stringify(state);
    return 'STAR1.' + toB64(json) + '.' + checksum(json);
  }
  function decode(code) {
    const clean = String(code || '').replace(/\s+/g, '');
    const parts = clean.split('.');
    if (parts.length !== 3 || parts[0] !== 'STAR1') throw new Error('這不是《觀星者之屋》的存檔碼。');
    let json;
    try { json = fromB64(parts[1]); } catch (e) { throw new Error('存檔碼內容損毀，無法解讀。'); }
    if (checksum(json) !== parts[2]) throw new Error('存檔碼不完整或被改動過（校驗失敗）。請確認整段都有複製到。');
    try { return JSON.parse(json); } catch (e) { throw new Error('存檔碼內容損毀，無法解讀。'); }
  }

  return {
    get persistent() { return !!ls; },
    read, write, remove, getEndings, addEnding, encode, decode,
    _reset() { for (const k of Object.keys(memory)) delete memory[k]; },
  };
}));
