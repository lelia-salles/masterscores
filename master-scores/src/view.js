import { Renderer, Stave, StaveNote, Formatter, Voice, Accidental, VexFlow } from 'vexflow';

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

	blocks.forEach( ( block ) => {
		const rawScore = block.getAttribute( 'data-score' );
		if ( ! rawScore ) return;

		try {
			const score = JSON.parse( rawScore );
			const frontendBox = block.querySelector( '.master-scores-frontend' );

			if ( frontendBox ) {
				const resizeObserver = new ResizeObserver( ( entries ) => {
					for ( const entry of entries ) {
						renderScore( score, block, entry.contentRect.width );
					}
				} );

				resizeObserver.observe( frontendBox );
			}
		} catch ( error ) {
			console.error( 'Master Scores: invalid score data', error );
		}
	} );
} );