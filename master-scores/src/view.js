import { Renderer, Stave, StaveNote, Formatter, Voice } from 'vexflow';

const renderScore = ( score, element ) => {
	if ( ! element || ! score?.tracks?.length ) {
		return;
	}

	const track = score.tracks[0];
	const measure = track?.measures?.[0];
	const voiceData = measure?.voices?.[0];

	if ( ! measure || ! voiceData ) {
		return;
	}

	const canvasWidth = 600;
	const canvasHeight = 220;

	element.innerHTML = '';

	const renderer = new Renderer( element, Renderer.Backends.CANVAS );
	renderer.resize( canvasWidth, canvasHeight );

	const context = renderer.getContext();
	context.setFont( 'Arial', 10, '' ).setBackgroundFillStyle( '#f8fafc' );

	const stave = new Stave( 10, 40, canvasWidth - 20 );
	stave.addClef( measure.clef ).addTimeSignature( measure.timeSignature );
	stave.setContext( context ).draw();

	const notes = voiceData.notes.map( ( note ) => {
		const mappedKeys =
			note.isRest || note.keys.length === 0
				? [ 'b/4' ]
				: note.keys.map( ( key ) =>
						key
							.toLowerCase()
							.replace( /(\w)(#|b)?(\d)/, '$1$2/$3' )
				  );

		return new StaveNote( {
			clef: measure.clef,
			keys: mappedKeys,
			duration: note.isRest ? `${ note.duration }r` : note.duration,
		} );
	} );

	const [ numBeats, beatValue ] = measure.timeSignature.split( '/' ).map( Number );
	const voice = new Voice( { numBeats, beatValue } );
	voice.addTickables( notes );

	new Formatter().joinVoices( [ voice ] ).format( [ voice ], canvasWidth - 40 );
	voice.draw( context, stave );
};

document.addEventListener( 'DOMContentLoaded', () => {
	const blocks = document.querySelectorAll( '.wp-block-create-block-master-scores' );

	blocks.forEach( ( block ) => {
		const rawScore = block.getAttribute( 'data-score' );

		if ( ! rawScore ) {
			return;
		}

		try {
			const score = JSON.parse( rawScore );
			renderScore( score, block );
		} catch ( error ) {
			console.error( 'Master Scores: invalid score data', error );
		}
	} );
} );
