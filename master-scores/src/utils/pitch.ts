const PITCH_CLASS_SHARPS = [
    'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
];
const PITCH_CLASS_FLATS = [
    'C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B',
];
const NATURAL_MAP: Record<string, number> = {
    C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

/** "C4" → 60, "F#3" → 54, "Bb5" → 82; returns null on malformed input. */
export function keyToMidi(key: string): number | null {
    const m = key.match(/^([A-G])(#|b)?(-?\d)$/);
    if (!m) return null;
    let pc = NATURAL_MAP[m[1]];
    if (m[2] === '#') pc += 1;
    else if (m[2] === 'b') pc -= 1;
    const octave = parseInt(m[3], 10);
    return (octave + 1) * 12 + pc;
}

/** 60 → "C4", 61 → "C#4" (or "Db4" when preferFlat). */
export function midiToKey(midi: number, preferFlat = false): string {
    if (midi < 0 || midi > 127) return 'C4';
    const octave = Math.floor(midi / 12) - 1;
    const pc = ((midi % 12) + 12) % 12;
    return `${(preferFlat ? PITCH_CLASS_FLATS : PITCH_CLASS_SHARPS)[pc]}${octave}`;
}

/**
 * Transposes a key by semitones, preserving flat vs sharp spelling where the
 * source note already used one (F#4 − 1 → F4, Bb4 + 1 → B4).
 */
export function transposeKey(key: string, semitones: number): string {
    const midi = keyToMidi(key);
    if (midi === null) return key;
    return midiToKey(midi + semitones, key.includes('b'));
}

/** Replaces the accidental character without changing the notehead position. */
export function setKeyAccidental(
    key: string,
    accidental: '' | '#' | 'b'
): string {
    const m = key.match(/^([A-G])(#|b)?(-?\d)$/);
    if (!m) return key;
    return `${m[1]}${accidental}${m[3]}`;
}