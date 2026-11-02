<?php
/**
 * Render callback for the Master Scores block.
 *
 * @var array    $attributes Block attributes.
 * @var string   $content    Inner block content (unused).
 * @var WP_Block $block      Block instance.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$score = isset( $attributes['score'] ) ? $attributes['score'] : array();

if ( empty( $score ) ) {
	return;
}

// Sanity-check the shape so a corrupted attribute cannot break the frontend.
if ( empty( $score['tracks'][0]['measures'][0]['voices'][0]['notes'] ) ) {
	return;
}

$json = wp_json_encode( $score );

// Enqueue the frontend script only when the block is actually rendered.
if ( ! wp_script_is( 'master-scores-view', 'enqueued' ) ) {
	wp_enqueue_script(
		'master-scores-view',
		plugins_url( 'build/view.js', __FILE__ ),
		array(),
		filemtime( plugin_dir_path( __FILE__ ) . 'build/view.js' ),
		true
	);
}
?>
<div class="wp-block-create-block-master-scores">
	<div class="master-scores-score-panel">
		<div class="master-scores-header">
			<h2><?php echo esc_html( $score['metadata']['title'] ?? '' ); ?></h2>
			<p><?php echo esc_html( $score['metadata']['composer'] ?? '' ); ?></p>
		</div>
		<div
			class="master-scores-canvas"
			data-score="<?php echo esc_attr( $json ); ?>"
		></div>
	</div>
</div>