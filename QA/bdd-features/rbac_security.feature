Feature: Role-Based Access Control (RBAC) and Security Guardrails
  As the E-Vigilance security layer
  In order to protect police operations and citizen privacy
  I want to restrict endpoints strictly according to user roles

  Scenario Outline: Endpoint authorization by role
    Given a user is authenticated with role "<role>"
    When the user sends a "<method>" request to "<endpoint>"
    Then the response status code should be "<expected_status>"

    Examples:
      | role            | method | endpoint                      | expected_status |
      | hq              | GET    | /api/users                    | 200             |
      | station_officer | GET    | /api/users                    | 403             |
      | hq              | GET    | /api/violation-catalog        | 200             |
      | station_officer | POST   | /api/violation-catalog        | 403             |
      | hq              | POST   | /api/police-stations          | 201             |
      | station_officer | POST   | /api/police-stations          | 403             |
      | unauthenticated | GET    | /api/violations               | 401             |

  Scenario: Immediate rejection of deactivated accounts
    Given an officer user is active and possesses a valid 7-day JWT token
    When HQ administrator deactivates the officer account
    And the officer attempts to call "/api/dispatches/inbox" with the original token
    Then the system re-queries the database and returns status 401 Unauthorized
