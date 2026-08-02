-- ============================================================================
--  Offers: brand-master link + exchange offers
--  The API applies this automatically on the first offers request; this file
--  is here if you'd rather run it by hand.
--
--  mysql -u <user> -p <database> < migrations/2026_08_offers_exchange.sql
-- ============================================================================

-- Adds the exchange-offer type to the section list
ALTER TABLE `offers`
  MODIFY COLUMN `section`
    ENUM('flash_sale','home_best','bank_offer','brand_deal','coupon','combo','clearance','exchange_offer')
    NOT NULL DEFAULT 'flash_sale';

-- brandId links a Brand Deal to the Brands master, so the card can show the
-- real brand logo instead of a letter.
ALTER TABLE `offers`
  ADD COLUMN `brandId` BIGINT(20) DEFAULT NULL;

-- Exchange offer fields
ALTER TABLE `offers`
  ADD COLUMN `exchangeTitle`       VARCHAR(255) DEFAULT NULL,
  ADD COLUMN `exchangePartnerName` VARCHAR(255) DEFAULT NULL,
  ADD COLUMN `ctaText`             VARCHAR(100) DEFAULT NULL;
