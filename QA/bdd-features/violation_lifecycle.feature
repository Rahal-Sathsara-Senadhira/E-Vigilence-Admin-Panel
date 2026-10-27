Feature: Traffic Violation Lifecycle and Dispatch Management
  As the E-Vigilance platform
  In order to enforce road discipline and accountability
  I want to process violations from reporting to verification, citation, and resolution

  Background:
    Given the backend service is running on "http://localhost:8081"
    And an active HQ admin exists with email "admin@evigilance.com"
    And active police stations exist in the database

  Scenario: Successful citizen violation ingestion via M2M ingest key
    Given an external system provides a valid "X-Ingest-Key"
    When the system posts a violation with:
      | title          | Reckless Driving on Galle Road — WP CAB-1234 |
      | vehicleNumber  | WP CAB-1234                                  |
      | vehicleType    | Car                                          |
      | lat            | 6.9271                                       |
      | lng            | 79.8612                                      |
      | violations     | Speeding                                     |
    Then the response status code should be 201
    And the violation status should be "open"
    And the vehicle number should be normalized to "WP CAB-1234"

  Scenario: Auto-dispatch to the nearest active police station
    Given an "open" violation exists with GPS coordinates "6.9271, 79.8612"
    When an HQ administrator triggers auto-dispatch for this violation
    Then the system identifies the geographically nearest active police station
    And the violation assigned station is updated
    And a dispatch record is created with status "sent"

  Scenario: Station officer receives and updates violation status
    Given a violation is dispatched to "Colombo Central Police Station"
    And a station officer is logged in for that station
    When the officer views their station inbox
    Then the dispatched violation is visible
    When the officer transitions the status to "in_review" with note "Investigating CCTV footage"
    Then the violation status becomes "in_review"
    And an entry is appended to the violation's status audit trail with the officer's identity

  Scenario: Verified violation automatically generates fine and citation
    Given a violation in "in_review" status with catalog violation "Failure to wear protective helmets"
    When an authorized reviewer transitions the status to "verified"
    Then the violation status becomes "verified"
    And an official Citation document is generated
    And the citation fine amount matches the Violation Catalog fine of 1500
