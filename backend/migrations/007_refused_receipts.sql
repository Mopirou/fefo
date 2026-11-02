-- Why a lot was refused at reception (NULL = accepted). Refused lots keep their
-- row (and receipt move) for traceability but are never available for FEFO.
ALTER TABLE lot ADD COLUMN refusal_reason TEXT CHECK (refusal_reason IN ('temperature', 'manuel'));
UPDATE lot SET refusal_reason = 'manuel' WHERE conform = 0;
