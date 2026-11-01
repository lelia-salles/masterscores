export interface ScoreMetadata {
	title: string;
	composer: string;
}

export interface ScorePlayback {
	bpm: number;
	swing: boolean;
}

export interface ScoreNote {
	id: string;
	keys: string[];
	duration: string;
	isRest: boolean;
	dots: number;
}

export interface ScoreVoice {
	id: string;
	notes: ScoreNote[];
}

export interface ScoreMeasure {
	id: string;
	index: number;
	clef: string;
	timeSignature: string;
	keySignature: string;
	voices: ScoreVoice[];
}

export interface ScoreTrack {
	id: string;
	name: string;
	instrumentId: string;
	measures: ScoreMeasure[];
}

export interface ScoreState {
	id: string;
	metadata: ScoreMetadata;
	playback: ScorePlayback;
	tracks: ScoreTrack[];
}
