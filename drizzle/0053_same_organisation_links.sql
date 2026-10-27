-- A record and the records it names belong to the same organisation.
--
-- A foreign key proves the row it names exists, not whose it is: a risk in one
-- organisation could name another's legal entity, an AI system another's
-- supplier, and the database accepted both. The services now check every id
-- they are given (tenancy-guards.ts); these constraints make the same rule
-- structural, so a code path that forgets cannot write the link at all.
--
-- Each is added alongside the existing single-column key, which keeps its own
-- delete behaviour; these only refuse a mismatch. NOT VALID then VALIDATE, so a
-- row that breaks the rule fails this migration by name rather than silently.

CREATE UNIQUE INDEX IF NOT EXISTS "ai_change_org_id_key" ON "ai_change" (organisation_id, id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_conversation_org_id_key" ON "ai_conversation" (organisation_id, id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_use_case_org_id_key" ON "ai_use_case" (organisation_id, id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "assessment_org_id_key" ON "assessment" (organisation_id, id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "breach_org_id_key" ON "breach" (organisation_id, id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "document_org_id_key" ON "document" (organisation_id, id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "entity_org_id_key" ON "entity" (organisation_id, id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "evidence_org_id_key" ON "evidence" (organisation_id, id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "extraction_org_id_key" ON "extraction" (organisation_id, id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "integration_connection_org_id_key" ON "integration_connection" (organisation_id, id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "risk_org_id_key" ON "risk" (organisation_id, id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_org_id_key" ON "supplier" (organisation_id, id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "task_org_id_key" ON "task" (organisation_id, id);
--> statement-breakpoint
ALTER TABLE "retention_profile" ADD CONSTRAINT "retention_profile_entity_id_same_org" FOREIGN KEY (organisation_id, "entity_id") REFERENCES "entity" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "retention_profile" VALIDATE CONSTRAINT "retention_profile_entity_id_same_org";
--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_entity_id_same_org" FOREIGN KEY (organisation_id, "entity_id") REFERENCES "entity" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "audit_event" VALIDATE CONSTRAINT "audit_event_entity_id_same_org";
--> statement-breakpoint
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_entity_id_same_org" FOREIGN KEY (organisation_id, "entity_id") REFERENCES "entity" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "assessment" VALIDATE CONSTRAINT "assessment_entity_id_same_org";
--> statement-breakpoint
ALTER TABLE "risk" ADD CONSTRAINT "risk_entity_id_same_org" FOREIGN KEY (organisation_id, "entity_id") REFERENCES "entity" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "risk" VALIDATE CONSTRAINT "risk_entity_id_same_org";
--> statement-breakpoint
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_entity_id_same_org" FOREIGN KEY (organisation_id, "entity_id") REFERENCES "entity" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "schedule" VALIDATE CONSTRAINT "schedule_entity_id_same_org";
--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_entity_id_same_org" FOREIGN KEY (organisation_id, "entity_id") REFERENCES "entity" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "task" VALIDATE CONSTRAINT "task_entity_id_same_org";
--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_entity_id_same_org" FOREIGN KEY (organisation_id, "entity_id") REFERENCES "entity" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "evidence" VALIDATE CONSTRAINT "evidence_entity_id_same_org";
--> statement-breakpoint
ALTER TABLE "integration_connection" ADD CONSTRAINT "integration_connection_default_entity_id_same_org" FOREIGN KEY (organisation_id, "default_entity_id") REFERENCES "entity" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "integration_connection" VALIDATE CONSTRAINT "integration_connection_default_entity_id_same_org";
--> statement-breakpoint
ALTER TABLE "processing_activity" ADD CONSTRAINT "processing_activity_entity_id_same_org" FOREIGN KEY (organisation_id, "entity_id") REFERENCES "entity" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "processing_activity" VALIDATE CONSTRAINT "processing_activity_entity_id_same_org";
--> statement-breakpoint
ALTER TABLE "scan_finding" ADD CONSTRAINT "scan_finding_entity_id_same_org" FOREIGN KEY (organisation_id, "entity_id") REFERENCES "entity" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "scan_finding" VALIDATE CONSTRAINT "scan_finding_entity_id_same_org";
--> statement-breakpoint
ALTER TABLE "ai_use_case" ADD CONSTRAINT "ai_use_case_entity_id_same_org" FOREIGN KEY (organisation_id, "entity_id") REFERENCES "entity" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "ai_use_case" VALIDATE CONSTRAINT "ai_use_case_entity_id_same_org";
--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_entity_id_same_org" FOREIGN KEY (organisation_id, "entity_id") REFERENCES "entity" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "comment" VALIDATE CONSTRAINT "comment_entity_id_same_org";
--> statement-breakpoint
ALTER TABLE "ai_conversation" ADD CONSTRAINT "ai_conversation_entity_id_same_org" FOREIGN KEY (organisation_id, "entity_id") REFERENCES "entity" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "ai_conversation" VALIDATE CONSTRAINT "ai_conversation_entity_id_same_org";
--> statement-breakpoint
ALTER TABLE "breach" ADD CONSTRAINT "breach_entity_id_same_org" FOREIGN KEY (organisation_id, "entity_id") REFERENCES "entity" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "breach" VALIDATE CONSTRAINT "breach_entity_id_same_org";
--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_entity_id_same_org" FOREIGN KEY (organisation_id, "entity_id") REFERENCES "entity" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "document" VALIDATE CONSTRAINT "document_entity_id_same_org";
--> statement-breakpoint
ALTER TABLE "extraction" ADD CONSTRAINT "extraction_entity_id_same_org" FOREIGN KEY (organisation_id, "entity_id") REFERENCES "entity" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "extraction" VALIDATE CONSTRAINT "extraction_entity_id_same_org";
--> statement-breakpoint
ALTER TABLE "atrs_record" ADD CONSTRAINT "atrs_record_entity_id_same_org" FOREIGN KEY (organisation_id, "entity_id") REFERENCES "entity" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "atrs_record" VALIDATE CONSTRAINT "atrs_record_entity_id_same_org";
--> statement-breakpoint
ALTER TABLE "ai_change" ADD CONSTRAINT "ai_change_entity_id_same_org" FOREIGN KEY (organisation_id, "entity_id") REFERENCES "entity" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "ai_change" VALIDATE CONSTRAINT "ai_change_entity_id_same_org";
--> statement-breakpoint
ALTER TABLE "ai_assurance_record" ADD CONSTRAINT "ai_assurance_record_entity_id_same_org" FOREIGN KEY (organisation_id, "entity_id") REFERENCES "entity" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "ai_assurance_record" VALIDATE CONSTRAINT "ai_assurance_record_entity_id_same_org";
--> statement-breakpoint
ALTER TABLE "ai_incident" ADD CONSTRAINT "ai_incident_entity_id_same_org" FOREIGN KEY (organisation_id, "entity_id") REFERENCES "entity" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "ai_incident" VALIDATE CONSTRAINT "ai_incident_entity_id_same_org";
--> statement-breakpoint
ALTER TABLE "ai_use_case_request" ADD CONSTRAINT "ai_use_case_request_entity_id_same_org" FOREIGN KEY (organisation_id, "entity_id") REFERENCES "entity" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "ai_use_case_request" VALIDATE CONSTRAINT "ai_use_case_request_entity_id_same_org";
--> statement-breakpoint
ALTER TABLE "contributor_link" ADD CONSTRAINT "contributor_link_assessment_id_same_org" FOREIGN KEY (organisation_id, "assessment_id") REFERENCES "assessment" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "contributor_link" VALIDATE CONSTRAINT "contributor_link_assessment_id_same_org";
--> statement-breakpoint
ALTER TABLE "risk" ADD CONSTRAINT "risk_assessment_id_same_org" FOREIGN KEY (organisation_id, "assessment_id") REFERENCES "assessment" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "risk" VALIDATE CONSTRAINT "risk_assessment_id_same_org";
--> statement-breakpoint
ALTER TABLE "scan_finding" ADD CONSTRAINT "scan_finding_converted_risk_id_same_org" FOREIGN KEY (organisation_id, "converted_risk_id") REFERENCES "risk" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "scan_finding" VALIDATE CONSTRAINT "scan_finding_converted_risk_id_same_org";
--> statement-breakpoint
ALTER TABLE "ai_incident" ADD CONSTRAINT "ai_incident_linked_risk_id_same_org" FOREIGN KEY (organisation_id, "linked_risk_id") REFERENCES "risk" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "ai_incident" VALIDATE CONSTRAINT "ai_incident_linked_risk_id_same_org";
--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_task_id_same_org" FOREIGN KEY (organisation_id, "task_id") REFERENCES "task" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "notification" VALIDATE CONSTRAINT "notification_task_id_same_org";
--> statement-breakpoint
ALTER TABLE "scan_finding" ADD CONSTRAINT "scan_finding_evidence_id_same_org" FOREIGN KEY (organisation_id, "evidence_id") REFERENCES "evidence" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "scan_finding" VALIDATE CONSTRAINT "scan_finding_evidence_id_same_org";
--> statement-breakpoint
ALTER TABLE "dpa" ADD CONSTRAINT "dpa_source_connection_id_same_org" FOREIGN KEY (organisation_id, "source_connection_id") REFERENCES "integration_connection" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "dpa" VALIDATE CONSTRAINT "dpa_source_connection_id_same_org";
--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_source_connection_id_same_org" FOREIGN KEY (organisation_id, "source_connection_id") REFERENCES "integration_connection" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "evidence" VALIDATE CONSTRAINT "evidence_source_connection_id_same_org";
--> statement-breakpoint
ALTER TABLE "processing_activity" ADD CONSTRAINT "processing_activity_source_connection_id_same_org" FOREIGN KEY (organisation_id, "source_connection_id") REFERENCES "integration_connection" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "processing_activity" VALIDATE CONSTRAINT "processing_activity_source_connection_id_same_org";
--> statement-breakpoint
ALTER TABLE "scan_finding" ADD CONSTRAINT "scan_finding_source_connection_id_same_org" FOREIGN KEY (organisation_id, "source_connection_id") REFERENCES "integration_connection" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "scan_finding" VALIDATE CONSTRAINT "scan_finding_source_connection_id_same_org";
--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_source_connection_id_same_org" FOREIGN KEY (organisation_id, "source_connection_id") REFERENCES "integration_connection" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "supplier" VALIDATE CONSTRAINT "supplier_source_connection_id_same_org";
--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_connection_id_same_org" FOREIGN KEY (organisation_id, "connection_id") REFERENCES "integration_connection" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "webhook_delivery" VALIDATE CONSTRAINT "webhook_delivery_connection_id_same_org";
--> statement-breakpoint
ALTER TABLE "ai_use_case" ADD CONSTRAINT "ai_use_case_source_connection_id_same_org" FOREIGN KEY (organisation_id, "source_connection_id") REFERENCES "integration_connection" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "ai_use_case" VALIDATE CONSTRAINT "ai_use_case_source_connection_id_same_org";
--> statement-breakpoint
ALTER TABLE "dpa" ADD CONSTRAINT "dpa_supplier_id_same_org" FOREIGN KEY (organisation_id, "supplier_id") REFERENCES "supplier" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "dpa" VALIDATE CONSTRAINT "dpa_supplier_id_same_org";
--> statement-breakpoint
ALTER TABLE "ai_use_case" ADD CONSTRAINT "ai_use_case_supplier_id_same_org" FOREIGN KEY (organisation_id, "supplier_id") REFERENCES "supplier" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "ai_use_case" VALIDATE CONSTRAINT "ai_use_case_supplier_id_same_org";
--> statement-breakpoint
ALTER TABLE "atrs_record" ADD CONSTRAINT "atrs_record_ai_use_case_id_same_org" FOREIGN KEY (organisation_id, "ai_use_case_id") REFERENCES "ai_use_case" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "atrs_record" VALIDATE CONSTRAINT "atrs_record_ai_use_case_id_same_org";
--> statement-breakpoint
ALTER TABLE "ai_change" ADD CONSTRAINT "ai_change_ai_use_case_id_same_org" FOREIGN KEY (organisation_id, "ai_use_case_id") REFERENCES "ai_use_case" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "ai_change" VALIDATE CONSTRAINT "ai_change_ai_use_case_id_same_org";
--> statement-breakpoint
ALTER TABLE "ai_assurance_record" ADD CONSTRAINT "ai_assurance_record_ai_use_case_id_same_org" FOREIGN KEY (organisation_id, "ai_use_case_id") REFERENCES "ai_use_case" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "ai_assurance_record" VALIDATE CONSTRAINT "ai_assurance_record_ai_use_case_id_same_org";
--> statement-breakpoint
ALTER TABLE "ai_incident" ADD CONSTRAINT "ai_incident_ai_use_case_id_same_org" FOREIGN KEY (organisation_id, "ai_use_case_id") REFERENCES "ai_use_case" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "ai_incident" VALIDATE CONSTRAINT "ai_incident_ai_use_case_id_same_org";
--> statement-breakpoint
ALTER TABLE "ai_use_case_request" ADD CONSTRAINT "ai_use_case_request_ai_use_case_id_same_org" FOREIGN KEY (organisation_id, "ai_use_case_id") REFERENCES "ai_use_case" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "ai_use_case_request" VALIDATE CONSTRAINT "ai_use_case_request_ai_use_case_id_same_org";
--> statement-breakpoint
ALTER TABLE "ai_suggestion" ADD CONSTRAINT "ai_suggestion_conversation_id_same_org" FOREIGN KEY (organisation_id, "conversation_id") REFERENCES "ai_conversation" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "ai_suggestion" VALIDATE CONSTRAINT "ai_suggestion_conversation_id_same_org";
--> statement-breakpoint
ALTER TABLE "breach_decision" ADD CONSTRAINT "breach_decision_breach_id_same_org" FOREIGN KEY (organisation_id, "breach_id") REFERENCES "breach" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "breach_decision" VALIDATE CONSTRAINT "breach_decision_breach_id_same_org";
--> statement-breakpoint
ALTER TABLE "extraction_finding" ADD CONSTRAINT "extraction_finding_source_document_id_same_org" FOREIGN KEY (organisation_id, "source_document_id") REFERENCES "document" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "extraction_finding" VALIDATE CONSTRAINT "extraction_finding_source_document_id_same_org";
--> statement-breakpoint
ALTER TABLE "extraction_finding" ADD CONSTRAINT "extraction_finding_extraction_id_same_org" FOREIGN KEY (organisation_id, "extraction_id") REFERENCES "extraction" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "extraction_finding" VALIDATE CONSTRAINT "extraction_finding_extraction_id_same_org";
--> statement-breakpoint
ALTER TABLE "extraction_link" ADD CONSTRAINT "extraction_link_extraction_id_same_org" FOREIGN KEY (organisation_id, "extraction_id") REFERENCES "extraction" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "extraction_link" VALIDATE CONSTRAINT "extraction_link_extraction_id_same_org";
--> statement-breakpoint
ALTER TABLE "extraction_link" ADD CONSTRAINT "extraction_link_followed_by_same_org" FOREIGN KEY (organisation_id, "followed_by") REFERENCES "extraction" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "extraction_link" VALIDATE CONSTRAINT "extraction_link_followed_by_same_org";
--> statement-breakpoint
ALTER TABLE "ai_assurance_record" ADD CONSTRAINT "ai_assurance_record_change_id_same_org" FOREIGN KEY (organisation_id, "change_id") REFERENCES "ai_change" (organisation_id, id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "ai_assurance_record" VALIDATE CONSTRAINT "ai_assurance_record_change_id_same_org";
--> statement-breakpoint
-- The people a record names — its owner, assignee, governance officer — are
-- members of its organisation, current or former. Memberships are deactivated,
-- never deleted, so a leaver's records still hold.;
--> statement-breakpoint
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_owner_id_member" FOREIGN KEY (organisation_id, "owner_id") REFERENCES membership (organisation_id, user_id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "assessment" VALIDATE CONSTRAINT "assessment_owner_id_member";
--> statement-breakpoint
ALTER TABLE "risk" ADD CONSTRAINT "risk_owner_id_member" FOREIGN KEY (organisation_id, "owner_id") REFERENCES membership (organisation_id, user_id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "risk" VALIDATE CONSTRAINT "risk_owner_id_member";
--> statement-breakpoint
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_assignee_user_id_member" FOREIGN KEY (organisation_id, "assignee_user_id") REFERENCES membership (organisation_id, user_id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "schedule" VALIDATE CONSTRAINT "schedule_assignee_user_id_member";
--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_assignee_user_id_member" FOREIGN KEY (organisation_id, "assignee_user_id") REFERENCES membership (organisation_id, user_id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "task" VALIDATE CONSTRAINT "task_assignee_user_id_member";
--> statement-breakpoint
ALTER TABLE "processing_activity" ADD CONSTRAINT "processing_activity_owner_id_member" FOREIGN KEY (organisation_id, "owner_id") REFERENCES membership (organisation_id, user_id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "processing_activity" VALIDATE CONSTRAINT "processing_activity_owner_id_member";
--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_owner_id_member" FOREIGN KEY (organisation_id, "owner_id") REFERENCES membership (organisation_id, user_id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "supplier" VALIDATE CONSTRAINT "supplier_owner_id_member";
--> statement-breakpoint
ALTER TABLE "ai_use_case" ADD CONSTRAINT "ai_use_case_owner_id_member" FOREIGN KEY (organisation_id, "owner_id") REFERENCES membership (organisation_id, user_id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "ai_use_case" VALIDATE CONSTRAINT "ai_use_case_owner_id_member";
--> statement-breakpoint
ALTER TABLE "ai_use_case" ADD CONSTRAINT "ai_use_case_governance_officer_id_member" FOREIGN KEY (organisation_id, "governance_officer_id") REFERENCES membership (organisation_id, user_id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "ai_use_case" VALIDATE CONSTRAINT "ai_use_case_governance_officer_id_member";
--> statement-breakpoint
ALTER TABLE "breach" ADD CONSTRAINT "breach_owner_id_member" FOREIGN KEY (organisation_id, "owner_id") REFERENCES membership (organisation_id, user_id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "breach" VALIDATE CONSTRAINT "breach_owner_id_member";
--> statement-breakpoint
ALTER TABLE "ai_incident" ADD CONSTRAINT "ai_incident_assigned_to_user_id_member" FOREIGN KEY (organisation_id, "assigned_to_user_id") REFERENCES membership (organisation_id, user_id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "ai_incident" VALIDATE CONSTRAINT "ai_incident_assigned_to_user_id_member";
--> statement-breakpoint
ALTER TABLE "training_record" ADD CONSTRAINT "training_record_user_id_member" FOREIGN KEY (organisation_id, "user_id") REFERENCES membership (organisation_id, user_id) NOT VALID;
--> statement-breakpoint
ALTER TABLE "training_record" VALIDATE CONSTRAINT "training_record_user_id_member";
--> statement-breakpoint
-- People: each organisation sees only its own members, current or former.
-- Accounts are shared across organisations, so without this any organisation's
-- query could read every user's name and email.;
--> statement-breakpoint
ALTER TABLE app_user ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_members ON app_user FOR SELECT
  USING (EXISTS (SELECT 1 FROM membership m WHERE m.user_id = app_user.id AND m.organisation_id = app_current_organisation()));
--> statement-breakpoint
CREATE POLICY tenant_member_update ON app_user FOR UPDATE
  USING (EXISTS (SELECT 1 FROM membership m WHERE m.user_id = app_user.id AND m.organisation_id = app_current_organisation()))
  WITH CHECK (EXISTS (SELECT 1 FROM membership m WHERE m.user_id = app_user.id AND m.organisation_id = app_current_organisation()));
--> statement-breakpoint
-- An invitation creates the account of somebody new to the platform.
CREATE POLICY tenant_invite ON app_user FOR INSERT WITH CHECK (true);
--> statement-breakpoint
-- Whether an email already has an account: the one question an invitation
-- must ask across organisations. Answered with the id alone.
CREATE OR REPLACE FUNCTION app_user_id_for_email(p_email text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT id FROM app_user WHERE email = lower(trim(p_email)) $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_user_id_for_email(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_user_id_for_email(text) TO govern_tenant;
