-- ============================================================================
--  Offers schema sync
--
--  Brings `ecommerce_web` in line with the reference `motabhai_db` schema for
--  the offers feature. Fixes:
--    Table 'ecommerce_web.offer_products' doesn't exist
--  plus the 17 offer-type columns (bank / coupon / brand deal / combo) that the
--  admin Offer form writes to.
--
--  Additive only — nothing is dropped and no data is deleted.
--  The API applies the same changes automatically on the first offers request
--  (see ensureOffersSchema in controllers/offerController.js); this file is
--  here if you'd rather run it by hand:
--
--    mysql -u <user> -p ecommerce_web < migrations/2026_08_offers_schema_sync.sql
-- ============================================================================

-- ── 1. Multi-product link table ─────────────────────────────────────────────
-- An offer can cover many items (flash sale over a set of SKUs, combo deals,
-- clearance groups). `offers.itemId` stays for the single-product case.
CREATE TABLE IF NOT EXISTS `offer_products` (
  `id`      BIGINT(20) NOT NULL AUTO_INCREMENT,
  `offerId` BIGINT(20) NOT NULL,
  `itemId`  BIGINT(20) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_offer_item` (`offerId`, `itemId`),
  KEY `fk_offer_products_item` (`itemId`),
  CONSTRAINT `fk_offer_products_offer` FOREIGN KEY (`offerId`)
    REFERENCES `offers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_offer_products_item` FOREIGN KEY (`itemId`)
    REFERENCES `items` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ── 2. itemId must be optional ──────────────────────────────────────────────
-- Bank offers, coupons, brand deals, combos and exchange offers have no single
-- product attached, so NOT NULL blocks creating them.
ALTER TABLE `offers`
  MODIFY COLUMN `itemId` BIGINT(20) DEFAULT NULL;

-- ── 3. Offer-type columns ───────────────────────────────────────────────────
-- Present in motabhai_db, missing here. Each ADD COLUMN is separate so that a
-- partially-migrated database can skip the ones it already has (re-running a
-- duplicate ADD COLUMN is a harmless "Duplicate column name" error).

-- Shared
ALTER TABLE `offers` ADD COLUMN `description`   TEXT         DEFAULT NULL;
ALTER TABLE `offers` ADD COLUMN `colorTheme`    VARCHAR(20)  DEFAULT 'blue';
ALTER TABLE `offers` ADD COLUMN `icon`          VARCHAR(20)  DEFAULT NULL;
ALTER TABLE `offers` ADD COLUMN `tags`          VARCHAR(500) DEFAULT NULL;

-- Bank offers
ALTER TABLE `offers` ADD COLUMN `bankName`      VARCHAR(255) DEFAULT NULL;
ALTER TABLE `offers` ADD COLUMN `bankAbbr`      VARCHAR(50)  DEFAULT NULL;
ALTER TABLE `offers` ADD COLUMN `offerText`     VARCHAR(100) DEFAULT NULL;
ALTER TABLE `offers` ADD COLUMN `offerSub`      VARCHAR(150) DEFAULT NULL;

-- Brand deals
ALTER TABLE `offers` ADD COLUMN `brandDealName` VARCHAR(255) DEFAULT NULL;
ALTER TABLE `offers` ADD COLUMN `discountLabel` VARCHAR(100) DEFAULT NULL;

-- Coupons
ALTER TABLE `offers` ADD COLUMN `couponTitle`   VARCHAR(255) DEFAULT NULL;
ALTER TABLE `offers` ADD COLUMN `categoryLabel` VARCHAR(100) DEFAULT NULL;
ALTER TABLE `offers` ADD COLUMN `minOrder`      DECIMAL(12,2) DEFAULT NULL;
ALTER TABLE `offers` ADD COLUMN `maxOff`        DECIMAL(12,2) DEFAULT NULL;
ALTER TABLE `offers` ADD COLUMN `validTill`     DATE         DEFAULT NULL;

-- Combo deals
ALTER TABLE `offers` ADD COLUMN `comboTitle`    VARCHAR(255) DEFAULT NULL;
ALTER TABLE `offers` ADD COLUMN `comboItems`    LONGTEXT
  CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL
  CHECK (JSON_VALID(`comboItems`));
