<?php
<?php
/**
 * Plugin Name:       Master Scores
 * Description:       Score editor block for WordPress.
 * Version:           1.0.0
 * Requires at least: 6.8
 * Requires PHP:      7.4
 * Author:            Master Musica
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       master-scores
 *
 * @package MasterScores
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Registers the Master Scores block.
 */
function master_scores_register_block() {
	register_block_type( __DIR__ . '/build' );
}
add_action( 'init', 'master_scores_register_block' );