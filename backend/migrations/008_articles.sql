-- An article is the generic item ("Citron"); products are its real references
-- ("Citron Aldi", "Citron Metro"), each with its own EAN, lots and traceability.
CREATE TABLE article (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE
);
ALTER TABLE product ADD COLUMN article_id INTEGER REFERENCES article(id);
CREATE INDEX idx_product_article ON product(article_id);

INSERT INTO article (name) SELECT MIN(name) FROM product GROUP BY name COLLATE NOCASE;
UPDATE product SET article_id = (SELECT a.id FROM article a WHERE a.name = product.name COLLATE NOCASE);
