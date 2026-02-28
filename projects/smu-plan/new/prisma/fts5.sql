-- FTS5 virtual table for Article full-text search
-- This must be applied AFTER the initial Prisma migration

CREATE VIRTUAL TABLE IF NOT EXISTS article_fts USING fts5(
  title,
  summary,
  content,
  slug UNINDEXED,
  article_id UNINDEXED
);

-- Trigger: sync on INSERT
CREATE TRIGGER IF NOT EXISTS article_fts_ai AFTER INSERT ON Article
WHEN new.status = 'published'
BEGIN
  INSERT INTO article_fts(title, summary, content, slug, article_id)
  VALUES (new.title, COALESCE(new.summary, ''), new.content, new.slug, new.id);
END;

-- Trigger: sync on DELETE
CREATE TRIGGER IF NOT EXISTS article_fts_ad AFTER DELETE ON Article BEGIN
  DELETE FROM article_fts WHERE article_id = old.id;
END;

-- Trigger: sync on UPDATE (delete old + insert new if published)
CREATE TRIGGER IF NOT EXISTS article_fts_au AFTER UPDATE ON Article BEGIN
  DELETE FROM article_fts WHERE article_id = old.id;
  INSERT INTO article_fts(title, summary, content, slug, article_id)
  SELECT new.title, COALESCE(new.summary, ''), new.content, new.slug, new.id
  WHERE new.status = 'published';
END;
