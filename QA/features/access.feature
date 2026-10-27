Feature: Who can open what
  The server must refuse access, not just hide the menu.

  Scenario: No token means no data
    When I open "/cases" without signing in
    Then I get status 401

  Scenario: A fake token is refused
    When I open "/cases" with the token "abc123"
    Then I get status 401

  Scenario Outline: Each role sees only what it should
    Given I am signed in as "<account>"
    When I open "<page>"
    Then I get status <status>

    Examples:
      | account                        | page   | status |
      | officer.kandy@evigilance.local | /cases | 200    |
      | officer.kandy@evigilance.local | /audit | 403    |
      | oic.kandy@evigilance.local     | /audit | 200    |
      | clerk.kandy@evigilance.local   | /users | 403    |

  Scenario: The public can't see a notice with the wrong vehicle number
    When I look up notice "PN-2026-000001" with vehicle "CP CAB-9999"
    Then I get status 404
    And the message is "No notice matches that number and vehicle number. Check both and try again."
