-- Start with copperwork (cuivre / dinanderie) only. Other built-in categories stay available and can be
-- switched back on in Réglages → Catégories (e.g. babouches) without any code change.
update atelier.categories set active = (code = 'copper') where code is not null;
