import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { useStellar } from "@/lib/stellar/hooks/use-stellar";
import { GENRE_VALUES, type Card, type Genre } from "@/lib/stellar/types";

type NewCard = Omit<Card, "card_id">;
type CardFields = Record<"genre" | "artist" | "title" | "year" | "difficulty" | "lyrics", string>;
type CardErrors = Partial<Record<keyof CardFields, string>>;
type ImportStatus = "pending" | "added" | "failed";
type ImportRow = { fields: CardFields; errors: CardErrors; status: ImportStatus; failure?: string };

// Mirrors `validate_card` and `MAX_CARDS_PER_BATCH` in `onchain/contracts/lyricsflip/src/lib.rs`.
const MIN_CARD_YEAR = 1900;
const MAX_LYRICS_LEN = 1000;
const MAX_CARDS_PER_BATCH = 20;
const CATALOGUE_SIZE = 50;

const emptyFields: CardFields = { genre: GENRE_VALUES[0], artist: "", title: "", year: "", difficulty: "2", lyrics: "" };

const validateCard = (fields: CardFields): CardErrors => {
    const errors: CardErrors = {};
    const year = Number(fields.year);
    const difficulty = Number(fields.difficulty);
    if (!GENRE_VALUES.includes(fields.genre as Genre)) errors.genre = `Genre must be one of ${GENRE_VALUES.join(", ")}`;
    if (!fields.artist) errors.artist = "Artist is required";
    else if (!isCleanText(fields.artist)) errors.artist = "Artist contains control characters or surrounding whitespace";
    if (!fields.title) errors.title = "Title is required";
    else if (!isCleanText(fields.title)) errors.title = "Title contains control characters or surrounding whitespace";
    if (!fields.lyrics) errors.lyrics = "Lyrics are required";
    else if (new TextEncoder().encode(fields.lyrics).length > MAX_LYRICS_LEN) errors.lyrics = `Lyrics must be at most ${MAX_LYRICS_LEN} UTF-8 bytes`;
    if (!Number.isInteger(year) || year < MIN_CARD_YEAR || year > new Date().getFullYear()) {
        errors.year = `Year must be between ${MIN_CARD_YEAR} and ${new Date().getFullYear()}`;
    }
    if (![1, 2, 3].includes(difficulty)) errors.difficulty = "Difficulty must be 1, 2, or 3";
    return errors;
};

const isCleanText = (value: string): boolean =>
    !/[\u0000-\u001f\u007f]/.test(value) &&
    !/^[ \t\n\r]|[ \t\n\r]$/.test(value);

const cardIdentity = (fields: Pick<CardFields, "title" | "artist">): string =>
    `${fields.title.replace(/[A-Z]/g, (char) => char.toLowerCase())}\0${fields.artist.replace(/[A-Z]/g, (char) => char.toLowerCase())}`;

const fromCard = (card: Card): CardFields => ({
    genre: card.genre,
    artist: card.artist,
    title: card.title,
    year: card.year.toString(),
    difficulty: String(card.difficulty),
    lyrics: card.lyrics,
});

const toCard = (fields: CardFields): NewCard => ({
    genre: fields.genre as Genre,
    artist: fields.artist,
    title: fields.title,
    year: BigInt(fields.year),
    difficulty: Number(fields.difficulty),
    lyrics: fields.lyrics,
});

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, embedded newlines). */
const parseCsv = (text: string): string[][] => {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
            if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
            else if (c === '"') quoted = false;
            else field += c;
        } else if (c === '"') quoted = true;
        else if (c === ",") { row.push(field); field = ""; }
        else if (c === "\n" || c === "\r") {
            if (c === "\r" && text[i + 1] === "\n") i++;
            row.push(field); rows.push(row); row = []; field = "";
        } else field += c;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((f) => f.trim()));
};

const parseImport = (fileName: string, text: string): CardFields[] => {
    let records: Record<string, unknown>[];
    if (fileName.toLowerCase().endsWith(".json")) {
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed) || parsed.some((row) => row === null || typeof row !== "object" || Array.isArray(row))) {
            throw new Error("JSON must be an array of card objects");
        }
        records = parsed;
    } else {
        const [header, ...rows] = parseCsv(text);
        if (!header) throw new Error("CSV is empty");
        const keys = header.map((h) => h.trim().toLowerCase());
        records = rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ""])));
    }
    return records.map((r) => ({
        genre: String(r.genre ?? "").trim(),
        artist: String(r.artist ?? ""),
        title: String(r.title ?? ""),
        year: String(r.year ?? "").trim(),
        difficulty: String(r.difficulty ?? "").trim() || "2",
        lyrics: String(r.lyrics ?? ""),
    }));
};

export const AdminCards = () => {
    const { systemCalls } = useStellar();
    const [fields, setFields] = useState<CardFields>(emptyFields);
    const [fieldErrors, setFieldErrors] = useState<CardErrors>({});
    const [importRows, setImportRows] = useState<ImportRow[]>([]);
    const [progress, setProgress] = useState<string | null>(null);
    const [importReport, setImportReport] = useState<string | null>(null);
    const [catalogue, setCatalogue] = useState<Card[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [editingId, setEditingId] = useState<bigint | null>(null);

    const filteredCatalogue = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return catalogue;
        return catalogue.filter((c) =>
            [c.title, c.artist, c.genre, c.year.toString(), c.card_id.toString()].some((v) => v.toLowerCase().includes(q)),
        );
    }, [catalogue, search]);

    const loadCatalogue = useCallback(async () => {
        if (!systemCalls) return;
        try {
            const count = await systemCalls.getCardsCount();
            const ids: bigint[] = [];
            for (let id = count; id > BigInt(0) && ids.length < CATALOGUE_SIZE; id--) ids.push(id);
            setCatalogue(await Promise.all(ids.map((id) => systemCalls.getCard(id))));
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load cards");
        }
    }, [systemCalls]);

    useEffect(() => {
        loadCatalogue();
    }, [loadCatalogue]);

    const importValidRows = importRows.filter(
        (row) => Object.keys(row.errors).length === 0 && row.status !== "added",
    );
    const importInvalidCount = importRows.filter(
        (row) => Object.keys(row.errors).length > 0,
    ).length;

    const handleAddCard = async (e: React.FormEvent) => {
        e.preventDefault();
        const errors = validateCard(fields);
        setFieldErrors(errors);
        if (Object.keys(errors).length || !systemCalls) return;

        setIsLoading(true);
        setError(null);
        try {
            if (editingId !== null) await systemCalls.updateCard(editingId, toCard(fields));
            else await systemCalls.addCard(toCard(fields));
            setFields(emptyFields);
            setEditingId(null);
            await loadCatalogue();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save card");
        } finally {
            setIsLoading(false);
        }
    };

    const handleEdit = (card: Card) => {
        setEditingId(card.card_id);
        setFields(fromCard(card));
        setFieldErrors({});
    };

    const cancelEdit = () => {
        setEditingId(null);
        setFields(emptyFields);
        setFieldErrors({});
    };

    const handleRemove = async (card: Card) => {
        if (!systemCalls || !window.confirm(`Remove card #${card.card_id} "${card.title}"?`)) return;
        setIsLoading(true);
        setError(null);
        try {
            await systemCalls.removeCard(card.card_id);
            if (editingId === card.card_id) cancelEdit();
            await loadCatalogue();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to remove card");
        } finally {
            setIsLoading(false);
        }
    };

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        setError(null);
        setImportReport(null);
        setImportRows([]);
        setIsLoading(true);
        setProgress("Validating rows and checking on-chain duplicates...");
        try {
            if (!systemCalls) throw new Error("Connect an admin wallet to validate imported cards.");
            const parsedRows = parseImport(file.name, await file.text());
            if (parsedRows.length === 0) throw new Error("No card rows found in the selected file.");
            const onChainCards: Card[] = [];
            for (let start = 0; ; start += 50) {
                const page = await systemCalls.getCards(start, 50);
                if (page.length === 0) break;
                onChainCards.push(...page);
            }

            const fileCounts = new Map<string, number>();
            for (const row of parsedRows) {
                if (!row.title || !row.artist) continue;
                const key = cardIdentity(row);
                fileCounts.set(key, (fileCounts.get(key) ?? 0) + 1);
            }
            const onChainKeys = new Set(onChainCards.map(cardIdentity));
            setImportRows(parsedRows.map((fields) => {
                const errors = validateCard(fields);
                const key = cardIdentity(fields);
                let duplicateError: string | undefined;
                if (fields.title && fields.artist && (fileCounts.get(key) ?? 0) > 1) {
                    duplicateError = "Duplicate title and artist in this file";
                } else if (fields.title && fields.artist && onChainKeys.has(key)) {
                    duplicateError = "This title and artist already exist on-chain";
                }
                if (duplicateError) {
                    errors.title = errors.title ? `${errors.title}; ${duplicateError}` : duplicateError;
                }
                return { fields, errors, status: "pending" as const };
            }));
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to parse file");
        } finally {
            setProgress(null);
            setIsLoading(false);
        }
    };

    const handleImport = async () => {
        if (importValidRows.length === 0 || !systemCalls) return;
        const rowsToAdd = importValidRows;
        setIsLoading(true);
        setError(null);
        setImportReport(null);
        const addedBefore = importRows.filter((row) => row.status === "added").length;
        const invalid = importInvalidCount;
        let added = addedBefore;
        try {
            const batches = Math.ceil(rowsToAdd.length / MAX_CARDS_PER_BATCH);
            for (let i = 0; i < rowsToAdd.length; i += MAX_CARDS_PER_BATCH) {
                const batch = rowsToAdd.slice(i, i + MAX_CARDS_PER_BATCH);
                setProgress(`Submitting batch ${Math.floor(i / MAX_CARDS_PER_BATCH) + 1} of ${batches}...`);
                try {
                    await systemCalls.addCards(batch.map((row) => toCard(row.fields)));
                    const addedIds = new Set(batch);
                    setImportRows((rows) => rows.map((row) =>
                        addedIds.has(row) ? { ...row, status: "added" as const, failure: undefined } : row,
                    ));
                    added += batch.length;
                } catch (err) {
                    const message = err instanceof Error ? err.message : "Batch submission failed";
                    const failedIds = new Set(batch);
                    setImportRows((rows) => rows.map((row) =>
                        failedIds.has(row) ? { ...row, status: "failed" as const, failure: message } : row,
                    ));
                    throw err;
                }
            }
            await loadCatalogue();
            setImportReport(`Added ${added} card${added === 1 ? "" : "s"} total. ${invalid} row${invalid === 1 ? "" : "s"} skipped for validation.`);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to import cards");
            const remaining = rowsToAdd.length - (added - addedBefore);
            setImportReport(`Import paused: ${added} card${added === 1 ? "" : "s"} added, ${invalid} invalid row${invalid === 1 ? "" : "s"} skipped, ${remaining} valid row${remaining === 1 ? "" : "s"} remaining.`);
        } finally {
            setProgress(null);
            setIsLoading(false);
        }
    };

    const field = (name: keyof CardFields, input: React.ReactNode) => (
        <div>
            <label htmlFor={`card-${name}`} className="block text-sm font-medium text-gray-700 capitalize">{name}</label>
            {input}
            {fieldErrors[name] && <p className="text-red-500 text-sm mt-1">{fieldErrors[name]}</p>}
        </div>
    );
    const update = (name: keyof CardFields) =>
        (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
            setFields((prev) => ({ ...prev, [name]: e.target.value }));

    return (
        <div className="p-4 mt-6 bg-white rounded-lg shadow space-y-8">
            <section>
                <h2 className="text-xl font-bold mb-4">{editingId !== null ? `Edit Card #${editingId}` : "Add Card"}</h2>
                <form onSubmit={handleAddCard} className="space-y-4" noValidate>
                    {field("genre", (
                        <select id="card-genre" value={fields.genre} onChange={update("genre")} className="w-full px-3 py-2 border rounded">
                            {GENRE_VALUES.map((g) => <option key={g} value={g}>{g}</option>)}
                        </select>
                    ))}
                    {field("artist", <Input id="card-artist" value={fields.artist} onChange={update("artist")} />)}
                    {field("title", <Input id="card-title" value={fields.title} onChange={update("title")} />)}
                    {field("year", <Input id="card-year" type="number" value={fields.year} onChange={update("year")} />)}
                    {field("difficulty", (
                        <select id="card-difficulty" value={fields.difficulty} onChange={update("difficulty")} className="w-full px-3 py-2 border rounded">
                            <option value="1">Easy (1)</option>
                            <option value="2">Medium (2)</option>
                            <option value="3">Hard (3)</option>
                        </select>
                    ))}
                    {field("lyrics", (
                        <textarea id="card-lyrics" value={fields.lyrics} onChange={update("lyrics")} rows={4} className="w-full px-3 py-2 border rounded" />
                    ))}
                    <div className="flex gap-2">
                        <Button type="submit" disabled={isLoading}>
                            {isLoading ? "Saving..." : editingId !== null ? "Save Changes" : "Add Card"}
                        </Button>
                        {editingId !== null && (
                            <Button type="button" onClick={cancelEdit} disabled={isLoading}>Cancel</Button>
                        )}
                    </div>
                </form>
            </section>

            <section>
                <h2 className="text-xl font-bold mb-2">Bulk Import</h2>
                <p className="text-sm text-gray-600 mb-2">
                    CSV with a header row, or a JSON array, with fields: genre, artist, title, year, difficulty, lyrics. Missing difficulty defaults to 2.
                </p>
                <input type="file" accept=".csv,.json" onChange={handleFile} disabled={isLoading} />
                {importRows.length > 0 && (
                    <div className="mt-4 overflow-x-auto">
                        <p role="status" className="mb-3 text-sm text-gray-600">
                            {importValidRows.length} valid row{importValidRows.length === 1 ? "" : "s"} ready to import;{" "}
                            {importInvalidCount} invalid row{importInvalidCount === 1 ? "" : "s"} skipped.
                        </p>
                        <table className="w-full text-sm border">
                            <thead>
                                <tr className="bg-gray-100 text-left">
                                    <th className="p-2">#</th><th className="p-2">Genre</th><th className="p-2">Artist</th>
                                    <th className="p-2">Title</th><th className="p-2">Year</th><th className="p-2">Difficulty</th><th className="p-2">Lyrics</th><th className="p-2">Errors</th>
                                </tr>
                            </thead>
                            <tbody>
                                {importRows.map(({ fields: row, errors: rowErrors, status, failure }, i) => (
                                    <tr key={i} className={Object.keys(rowErrors).length ? "bg-red-50" : status === "added" ? "bg-green-50" : ""}>
                                        <td className="p-2">{i + 1}</td><td className="p-2">{row.genre}</td><td className="p-2">{row.artist}</td>
                                        <td className="p-2">{row.title}</td><td className="p-2">{row.year}</td><td className="p-2">{row.difficulty}</td>
                                        <td className="p-2 truncate max-w-xs">{row.lyrics}</td>
                                        <td className="p-2 text-red-500">
                                            {Object.values(rowErrors).join("; ") || failure || (status === "added" ? "Added" : "")}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <Button onClick={handleImport} disabled={isLoading || importValidRows.length === 0} className="mt-4">
                            {importRows.some((row) => row.status === "failed") ? "Retry remaining valid cards" : `Import ${importValidRows.length} valid cards`}
                        </Button>
                    </div>
                )}
                {progress && <p className="text-sm text-gray-600 mt-2">{progress}</p>}
                {importReport && <p role="status" className="text-sm text-gray-600 mt-2">{importReport}</p>}
            </section>

            {error && <p className="text-red-500">{error}</p>}

            <section>
                <h2 className="text-xl font-bold mb-2">Catalogue</h2>
                <Input
                    aria-label="Search cards"
                    placeholder="Search by title, artist, genre, year or ID"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="mb-3"
                />
                {filteredCatalogue.length === 0 ? (
                    <p className="text-sm text-gray-600">{catalogue.length === 0 ? "No cards yet." : "No cards match your search."}</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm border">
                            <thead>
                                <tr className="bg-gray-100 text-left">
                                    <th className="p-2">ID</th><th className="p-2">Genre</th><th className="p-2">Artist</th>
                                    <th className="p-2">Title</th><th className="p-2">Year</th><th className="p-2">Difficulty</th><th className="p-2">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredCatalogue.map((card) => (
                                    <tr key={card.card_id.toString()}>
                                        <td className="p-2">{card.card_id.toString()}</td><td className="p-2">{card.genre}</td>
                                        <td className="p-2">{card.artist}</td><td className="p-2">{card.title}</td>
                                        <td className="p-2">{card.year.toString()}</td>
                                        <td className="p-2">{card.difficulty}</td>
                                        <td className="p-2 space-x-2 whitespace-nowrap">
                                            <button type="button" className="text-blue-600 hover:underline" onClick={() => handleEdit(card)} disabled={isLoading}>Edit</button>
                                            <button type="button" className="text-red-600 hover:underline" onClick={() => handleRemove(card)} disabled={isLoading}>Remove</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
};
