-- ============================================================================
--  Razorpay payment support
--  The API applies this automatically on boot; this file is here for
--  environments where you'd rather run migrations by hand.
--
--  mysql -u <user> -p <database> < migrations/2026_07_razorpay_payments.sql
-- ============================================================================

ALTER TABLE `website_orders`
  MODIFY COLUMN `status`
    ENUM('pending_payment','processing','shipped','delivered','cancelled','returned','payment_failed')
    NOT NULL DEFAULT 'processing';

ALTER TABLE `website_orders`
  ADD COLUMN `paymentProvider`   VARCHAR(30)  DEFAULT NULL AFTER `deliveryLabel`,
  ADD COLUMN `providerOrderId`   VARCHAR(80)  DEFAULT NULL AFTER `paymentProvider`,
  ADD COLUMN `providerPaymentId` VARCHAR(80)  DEFAULT NULL AFTER `providerOrderId`,
  ADD COLUMN `providerSignature` VARCHAR(255) DEFAULT NULL AFTER `providerPaymentId`,
  ADD COLUMN `paymentError`      VARCHAR(255) DEFAULT NULL AFTER `providerSignature`,
  ADD COLUMN `paidAt`            TIMESTAMP    NULL DEFAULT NULL AFTER `paymentError`;

CREATE INDEX `idx_website_orders_provider_order`
  ON `website_orders` (`providerOrderId`);

-- Guarantees a replayed webhook can never be applied to two orders
CREATE UNIQUE INDEX `uq_website_orders_provider_payment`
  ON `website_orders` (`providerPaymentId`);

CREATE TABLE IF NOT EXISTS `website_payment_events` (
  `id`                BIGINT(20)  NOT NULL AUTO_INCREMENT,
  `orderId`           BIGINT(20)  DEFAULT NULL,
  `provider`          VARCHAR(30) NOT NULL DEFAULT 'razorpay',
  `eventType`         VARCHAR(60) NOT NULL,
  `providerOrderId`   VARCHAR(80) DEFAULT NULL,
  `providerPaymentId` VARCHAR(80) DEFAULT NULL,
  `providerEventId`   VARCHAR(80) DEFAULT NULL,
  `amount`            DECIMAL(12,2) DEFAULT NULL,
  `status`            VARCHAR(40) DEFAULT NULL,
  `source`            VARCHAR(20) NOT NULL DEFAULT 'callback',
  `payload`           LONGTEXT    DEFAULT NULL,
  `createdAt`         TIMESTAMP   NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_payment_events_event` (`providerEventId`),
  KEY `idx_payment_events_order` (`orderId`),
  KEY `idx_payment_events_payment` (`providerPaymentId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
