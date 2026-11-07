import React, { createContext, useContext, useEffect, useState } from 'react';

const LangContext = createContext({ zh: true, toggle: () => {} });

function initialLang() {
  try {
    const saved = localStorage.getItem('tripsplit_lang');
    if (saved) return saved;
  } catch { /* ignore */ }
  return 'zh';
}

export function LangProvider({ children }) {
  const [lang, setLang] = useState(initialLang);
  useEffect(() => {
    try { localStorage.setItem('tripsplit_lang', lang); } catch { /* ignore */ }
    document.documentElement.lang = lang;
  }, [lang]);
  return (
    <LangContext.Provider value={{ lang, zh: lang === 'zh', toggle: () => setLang(l => (l === 'zh' ? 'en' : 'zh')) }}>
      {children}
    </LangContext.Provider>
  );
}

export const useLang = () => useContext(LangContext);
