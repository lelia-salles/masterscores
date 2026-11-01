import { Renderer, Stave, StaveNote, Formatter, Voice, Accidental, VexFlow } from 'vexflow';
import * as Tone from 'tone';

const mapDurationToTone = ( duration ) => {
	const map = {
		w: '1n',
		h: '2n',
		q: '4n',
		'8': '8n',
		'16': '16n',
		'32': '32n',
	};
	return map[ duration ] || '4n';
};

const renderScore = async ( score, element, width ) => {
	if ( ! element || ! score?.tracks?.length ) return;

	const track = score.tracks[ 0 ];
	const measure = track?.measures?.[ 0 ];
	const voiceData = measure?.voices?.[ 0 ];

	if ( ! measure || ! voiceData ) return;

	const canvasContainer = element.querySelector( '.master-scores-canvas-container' );
	if ( ! canvasContainer ) return;

	await VexFlow.loadFonts( 'Bravura', 'Academico' );

	const canvasWidth = Math.max( Math.floor( width ), 280 );
	const canvasHeight = 220;

	canvasContainer.innerHTML = '';

	const renderer = new Renderer( canvasContainer, Renderer.Backends.SVG );
	renderer.resize( canvasWidth, canvasHeight );

	const context = renderer.getContext();

	const stave = new Stave( 10, 40, canvasWidth - 20 );
	stave.addClef( measure.clef || 'treble' ).addTimeSignature( measure.timeSignature || '4/4' );
	stave.setContext( context ).draw();

	if ( ! voiceData.notes || voiceData.notes.length === 0 ) return;

	try {
		const notes = voiceData.notes.map( ( note ) => {
			const isRest = note.isRest || ! note.keys || note.keys.length === 0;
			const mappedKeys = isRest
				? [ 'b/4' ]
				: note.keys.map( ( key ) =>
						key.trim().toLowerCase().replace( /^([a-g])(#|b)?(\d)$/, '$1$2/$3' )
				  );

			const staveNote = new StaveNote( {
				clef: measure.clef || 'treble',
				keys: mappedKeys,
				duration: isRest ? `${ note.duration || 'q' }r` : ( note.duration || 'q' ),
			} );

			if ( ! isRest ) {
				note.keys.forEach( ( key, idx ) => {
					const match = key.trim().match( /^[a-gA-G](#|b)\d$/ );
					if ( match && match[ 1 ] ) {
						staveNote.addModifier( new Accidental( match[ 1 ] ), idx );
					}
				} );
			}

			return staveNote;
		} );

		const [ numBeats, beatValue ] = ( measure.timeSignature || '4/4' ).split( '/' ).map( Number );
		const voice = new Voice( { numBeats: numBeats || 4, beatValue: beatValue || 4 } );
		voice.setStrict( false );
		voice.addTickables( notes );

		new Formatter().joinVoices( [ voice ] ).format( [ voice ], Math.max( canvasWidth - 90, 150 ) );
		voice.draw( context, stave );
	} catch ( error ) {
		console.error( 'Master Scores: rendering error', error );
	}
};

document.addEventListener( 'DOMContentLoaded', () => {
	const blocks = document.querySelectorAll( '.wp-block-create-block-master-scores' );
	let synth = null;
	let activeButton = null;

	const resetButton = ( btn ) => {
		if ( ! btn ) return;
		btn.textContent = 'Tocar';
		btn.classList.add( 'master-scores-button-primary' );
	};

	blocks.forEach( ( block ) => {
		const rawScore = block.getAttribute( 'data-score' );
		if ( ! rawScore ) return;

		try {
			const score = JSON.parse( rawScore );
			const frontendBox = block.querySelector( '.master-scores-frontend' );
			const playBtn = block.querySelector( '.master-scores-play-btn' );

			if ( frontendBox ) {
				const resizeObserver = new ResizeObserver( ( entries ) => {
					for ( const entry of entries ) {
						renderScore( score, block, entry.contentRect.width );
					}
				} );

				resizeObserver.observe( frontendBox );
			}

			if ( playBtn ) {
				playBtn.addEventListener( 'click', async () => {
					// Se clicar no mesmo botão que já está a tocar, interrompe a reprodução
					if ( activeButton === playBtn ) {
						Tone.Transport.stop();
						Tone.Transport.cancel( 0 );
						resetButton( playBtn );
						activeButton = null;
						return;
					}

					// Se outro bloco estava a tocar, interrompe o anterior
					if ( activeButton ) {
						Tone.Transport.stop();
						Tone.Transport.cancel( 0 );
						resetButton( activeButton );
					}

					await Tone.start();

					if ( ! synth ) {
						synth = new Tone.PolySynth( Tone.Synth ).toDestination();
					}

					Tone.Transport.stop();
					Tone.Transport.cancel( 0 );
					Tone.Transport.bpm.value = score.playback?.bpm || 120;
					Tone.Transport.swing = score.playback?.swing ? 0.5 : 0;
					Tone.Transport.swingSubdivision = '8n';

					let currentTime = 0;
					const voice = score.tracks?.[ 0 ]?.measures?.[ 0 ]?.voices?.[ 0 ];

					if ( voice?.notes?.length ) {
						voice.notes.forEach( ( note ) => {
							const toneDuration = mapDurationToTone( note.duration );

							if ( ! note.isRest && note.keys?.length > 0 ) {
								const cleanKeys = note.keys.map( ( k ) => {
									const m = k.trim().match( /^([a-gA-G])(#|b)?(\d)$/ );
									return m ? `${ m[ 1 ].toUpperCase() }${ m[ 2 ] || '' }${ m[ 3 ] }` : 'C4';
								} );

								Tone.Transport.schedule( ( time ) => {
									synth.triggerAttackRelease( cleanKeys, toneDuration, time );
								}, currentTime );
							}

							currentTime += Tone.Time( toneDuration ).toSeconds();
						} );
					}

					Tone.Transport.schedule( ( time ) => {
						Tone.Draw.schedule( () => {
							resetButton( playBtn );
							if ( activeButton === playBtn ) {
								activeButton = null;
							}
							Tone.Transport.stop();
						}, time );
					}, currentTime );

					activeButton = playBtn;
					playBtn.textContent = 'Parar';
					playBtn.classList.remove( 'master-scores-button-primary' );
					Tone.Transport.start();
				} );
			}
		} catch ( error ) {
			console.error( 'Master Scores: invalid score data', error );
		}
	} );
} );