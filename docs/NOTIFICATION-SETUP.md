# Notification Setup

## Overview

The system supports two notification channels: **Email** (SMTP/SendGrid) and **WhatsApp** (Twilio). Both are optional and configurable.

## Enabling Notifications

Set `NOTIFICATION_CHANNELS` in your `.env`:

```env
NOTIFICATION_CHANNELS=email,whatsapp   # both
NOTIFICATION_CHANNELS=email            # email only
NOTIFICATION_CHANNELS=                 # disabled
```

## Email Configuration

### SMTP (any provider)

```env
EMAIL_SMTP_HOST=smtp.company.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_SECURE=true
EMAIL_FROM=dbchanges@company.com
EMAIL_USERNAME=service-account
EMAIL_PASSWORD=smtp-password
EMAIL_DBA_RECIPIENTS=dba@company.com,dba2@company.com
EMAIL_DEV_NOTIFY=true
```

### SendGrid

Use SendGrid's SMTP relay:

```env
EMAIL_SMTP_HOST=smtp.sendgrid.net
EMAIL_SMTP_PORT=587
EMAIL_SMTP_SECURE=true
EMAIL_FROM=dbchanges@company.com
EMAIL_USERNAME=apikey
EMAIL_PASSWORD=SG.your-sendgrid-api-key
```

## WhatsApp Configuration (Twilio)

### 1. Create a Twilio Account

Sign up at [twilio.com](https://www.twilio.com/) and enable the WhatsApp sandbox.

### 2. Configure Environment Variables

```env
WHATSAPP_PROVIDER=twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
WHATSAPP_DBA_NUMBERS=whatsapp:+919876543210,whatsapp:+919876543211
```

### 3. Event Filtering

Control which events trigger WhatsApp messages:

```env
WHATSAPP_NOTIFY_ON=failure,prod_deploy,approval_needed
```

Available events:
- `failure` — deployment failed
- `prod_deploy` — production deployment completed
- `approval_needed` — new changeset needs DBA approval
- `all` — all events

## Notification Events

| Event | Email | WhatsApp | Description |
|-------|-------|----------|-------------|
| Approval needed | Always | If `approval_needed` in notify list | New changeset waiting for review |
| Deploy success | Always | If `prod_deploy` in notify list | Deployment completed |
| Deploy failed | Always | If `failure` in notify list | Deployment failed |
| Rollback | Always | If `failure` in notify list | Rollback executed |

## Graceful Degradation

If one notification channel fails, others still send. Failures are logged but do not block the pipeline.
