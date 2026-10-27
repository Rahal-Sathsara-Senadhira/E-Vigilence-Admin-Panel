Feature: Staff sign-in
  As a police staff member
  I want to sign in securely
  So that only real staff can use E-Vigilance

  Scenario: An officer signs in with the right password
    When I sign in as "officer.kandy@evigilance.local" with the correct password
    Then I get status 200
    And I receive an access token

  Scenario: A wrong password is refused
    When I sign in as "officer.kandy@evigilance.local" with password "Wrong123"
    Then I get status 401
    And the message is "The email or service number, or the password, is not correct."

  Scenario: An unknown account gets the same message
    When I sign in as "nobody@evigilance.local" with password "Wrong123"
    Then I get status 401
    And the message is "The email or service number, or the password, is not correct."

  Scenario: Signing in with the service number works
    When I sign in as "KD3002" with the correct password
    Then I get status 200
    And I receive an access token

  Scenario: Empty fields are refused
    When I sign in with an empty form
    Then I get status 400

  Scenario: A request without the security header is blocked
    When I sign in as "officer.kandy@evigilance.local" without the security header
    Then I get status 403
