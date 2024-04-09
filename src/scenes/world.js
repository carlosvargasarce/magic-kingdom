import { Scene } from 'phaser';
import { WORLD_ASSET_KEYS } from '../assets/asset-keys.js';
import { DIRECTION } from '../common/direction.js';
import { TILE_COLLISION_LAYER_ALPHA, TILE_SIZE } from '../config.js';
import { Controls } from '../utils/controls.js';
import { DATA_MANAGER_STORE_KEYS, dataManager } from '../utils/data-manager.js';
import { getTargetPositionFromGameObjectPositionAndDirection } from '../utils/grid-utils.js';
import { CANNOT_READ_SIGN_TEXT, SAMPLE_TEXT } from '../utils/text.utils.js';
import { Player } from '../world/characters/player.js';
import { DialogUi } from '../world/dialog-ui.js';
import { SCENE_KEYS } from './scene-keys.js';

/**
 * @typedef TiledObjectProperty
 * @type {object}
 * @property {string} name
 * @property {string} type
 * @property {any} value
 */

export default class World extends Scene {
  /** @type {Player} */
  #player;
  /** @type {Controls} */
  #controls;
  /** @type {Phaser.Tilemaps.TilemapLayer} */
  #encounterLayer;
  /** @type {boolean} */
  #wildMonsterEncountered;
  /** @type {Phaser.Tilemaps.ObjectLayer} */
  #signLayer;
  /** @type {DialogUi} */
  #dialogUi;

  constructor() {
    super({
      key: SCENE_KEYS.WORLD_SCENE,
    });
  }

  init() {
    this.#wildMonsterEncountered = false;
  }

  create() {
    console.log(`[${World.name}:created] invoked`);

    const x = 6 * TILE_SIZE;
    const y = 22 * TILE_SIZE;

    this.cameras.main.setBounds(0, 0, 1280, 2176);
    this.cameras.main.setZoom(0.8);
    this.cameras.main.centerOn(x, y);

    const map = this.make.tilemap({ key: WORLD_ASSET_KEYS.WORLD_MAIN_LEVEL });
    const collisionTiles = map.addTilesetImage(
      'collision',
      WORLD_ASSET_KEYS.WORLD_COLLISION
    );

    //Collision Tiles and Layer
    if (!collisionTiles) {
      console.log(
        `[${World.name}:create] encountered error while creating collision tileset using data from tile`
      );
      return;
    }

    const collisionLayer = map.createLayer('Collision', collisionTiles, 0, 0);
    if (!collisionLayer) {
      console.log(
        `[${World.name}:create] encountered error while creating collision layer using data from tile`
      );
      return;
    }
    collisionLayer.setAlpha(TILE_COLLISION_LAYER_ALPHA).setDepth(2);

    // Create Interactive Layer
    this.#signLayer = map.getObjectLayer('Sign');

    if (!this.#signLayer) {
      console.log(
        `[${World.name}:create] encountered error while creating sign layer using data from tile`
      );
      return;
    }
    console.log(this.#signLayer);

    //Encounter Tiles and Layer
    const encounterTiles = map.addTilesetImage(
      'encounter',
      WORLD_ASSET_KEYS.WORLD_ENCOUNTER_ZONE
    );

    if (!encounterTiles) {
      console.log(
        `[${World.name}:create] encountered error while creating encounter tiles using data from tile`
      );
      return;
    }

    this.#encounterLayer = map.createLayer('Encounter', encounterTiles, 0, 0);
    if (!this.#encounterLayer) {
      console.log(
        `[${World.name}:create] encountered error while creating encounter layer using data from tile`
      );
      return;
    }
    this.#encounterLayer.setAlpha(TILE_COLLISION_LAYER_ALPHA).setDepth(2);

    this.add.image(0, 0, WORLD_ASSET_KEYS.WORLD_BACKGROUND, 0).setOrigin(0);

    this.#player = new Player({
      scene: this,
      position: dataManager.store.get(DATA_MANAGER_STORE_KEYS.PLAYER_POSITION),
      direction: dataManager.store.get(
        DATA_MANAGER_STORE_KEYS.PLAYER_DIRECTION
      ),
      collisionLayer: collisionLayer,
      spriteGridMovementFinishedCallback: () => {
        this.#handlePlayerMovementUpdate();
      },
    });

    // Create Foreground for Depth
    this.cameras.main.startFollow(this.#player.sprite);
    this.add.image(0, 0, WORLD_ASSET_KEYS.WORLD_FOREGROUND, 0).setOrigin(0);
    this.#controls = new Controls(this);

    // Create Dialog UI
    this.#dialogUi = new DialogUi(this, 1280);

    this.cameras.main.fadeIn(1000, 0, 0, 0);
  }

  /**
   *
   * @param {DOMHighResTimeStamp} time
   * @returns {void}
   */
  update(time) {
    if (this.#wildMonsterEncountered) {
      this.#player.update(time);
      return;
    }

    const selectedDirection = this.#controls.getDirectionKeyPressedDown();

    if (selectedDirection !== DIRECTION.NONE && !this.#isPlayerInputLocked()) {
      this.#player.moveCharacter(selectedDirection);
    }

    if (this.#controls.wasSpaceKeyPressed() && !this.#player.isMoving) {
      this.#handlePlayerInteraction();
    }

    this.#player.update(time);
  }

  #handlePlayerInteraction() {
    if (this.#dialogUi.isAnimationPlaying) {
      return;
    }

    if (this.#dialogUi.isVisible && !this.#dialogUi.moreMessagesToShow) {
      this.#dialogUi.hideDialogModal();
      return;
    }

    if (this.#dialogUi.isVisible && this.#dialogUi.moreMessagesToShow) {
      this.#dialogUi.showNextMessage();
      return;
    }

    console.log('start of interaction check');

    const { x, y } = this.#player.sprite;

    const targetPosition = getTargetPositionFromGameObjectPositionAndDirection(
      { x, y },
      this.#player.direction
    );

    const nearbySign = this.#signLayer.objects.find((object) => {
      if (!object.x || !object.y) {
        return;
      }

      return (
        object.x === targetPosition.x &&
        object.y - TILE_SIZE === targetPosition.y
      );
    });

    if (nearbySign) {
      /** @type {TiledObjectProperty[]} */
      const props = nearbySign.properties;
      /** @type {string} */
      const msg = props.find((prop) => prop.name === 'message')?.value;

      const usePlaceholderText = this.#player.direction !== DIRECTION.UP;
      let textToShow = CANNOT_READ_SIGN_TEXT;

      if (!usePlaceholderText) {
        textToShow = msg || SAMPLE_TEXT;
      }

      this.#dialogUi.showDialogModal([textToShow]);

      return;
    }
  }

  /**
   * @returns {void}
   */
  #handlePlayerMovementUpdate() {
    dataManager.store.set(DATA_MANAGER_STORE_KEYS.PLAYER_POSITION, {
      x: this.#player.sprite.x,
      y: this.#player.sprite.y,
    });

    dataManager.store.set(
      DATA_MANAGER_STORE_KEYS.PLAYER_DIRECTION,
      this.#player.direction
    );

    if (!this.#encounterLayer) {
      return;
    }

    const isInEncounterZone =
      this.#encounterLayer.getTileAtWorldXY(
        this.#player.sprite.x,
        this.#player.sprite.y,
        true
      ).index !== -1;

    if (!isInEncounterZone) {
      return;
    }

    console.log(
      `[${World.name}:handlePlayerMovementUpdate] player is in a encounter zone`
    );
    this.#wildMonsterEncountered = Math.random() < 0.2;

    if (this.#wildMonsterEncountered) {
      console.log(
        `[${World.name}:handlePlayerMovementUpdate] player encountered a wild monster`
      );
      this.cameras.main.fadeOut(2000);
      this.cameras.main.once(
        Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
        () => {
          this.scene.start(SCENE_KEYS.BATTLE_SCENE);
        }
      );
    }
  }

  #isPlayerInputLocked() {
    return this.#dialogUi.isVisible;
  }
}
