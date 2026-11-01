import { ScoreState } from './types/scores';

export const initialScoreMock: ScoreState = {
	id: 'score-mvp-001',
	metadata: {
		title: 'Minha Primeira Partitura',
		composer: 'Compositor / WordPress',
	},
	playback: {
		bpm: 120,
		swing: false,
	},
	tracks: [
		{
			id: 'track-001',
			name: 'Piano',
			instrumentId: 'acoustic_grand_piano',
			measures: [
				{
					id: 'measure-001',
					index: 0,
					clef: 'treble',
					timeSignature: '4/4',
					keySignature: 'C',
					voices: [
						{
							id: 'voice-001',
							notes: [
								{ id: 'note-1', keys: [ 'C4' ], duration: 'q', isRest: false, dots: 0 },
								{ id: 'note-2', keys: [ 'D4' ], duration: 'q', isRest: false, dots: 0 },
								{ id: 'note-3', keys: [], duration: 'q', isRest: true, dots: 0 },
								{ id: 'note-4', keys: [ 'E5', 'G5' ], duration: 'q', isRest: false, dots: 0 },
							],
						},
					],
				},
			],
		},
	],
};
    }
  ]
};
