-- Aggiunta colonne per il digest delle notizie personalizzato
ALTER TABLE user_profile 
ADD COLUMN IF NOT EXISTS news_topics TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS news_delivery_time TIME DEFAULT '07:30:00';

-- Inizializza con argomenti di default per il profilo di Cristiano
UPDATE user_profile 
SET news_topics = ARRAY['Apple', 'Intelligenza Artificiale', 'Tecnologia'] 
WHERE id = '00000000-0000-0000-0000-000000000000'
  AND (news_topics IS NULL OR cardinality(news_topics) = 0);
