# Phase 9: Realtime Communication (Messaging) Report

## 1. Overview
In Phase 9, we implemented a real-time messaging system allowing 1-1 communication between Candidates and Employers regarding specific Job Posts. The goal was to establish a secure, performant, and reliable channel for recruitment communication.

## 2. Key Features Implemented
- **Database Schema**: 
  - Added `employerId` to `JobPost` to explicitly define the owner/recruiter.
  - Added `Conversation` and `Message` models in Prisma schema.
  - Added read receipt tracking (`candidateLastReadAt`, `employerLastReadAt`).
- **Backend Architecture (Modular Monolith)**:
  - Integrated `Socket.IO` directly into the Express backend server (sharing the same process).
  - Used Nginx reverse proxy configuration to properly route WebSocket upgrade requests (`/api/socket.io`).
  - Added `MessagingService` to securely handle messaging logic (verifying room access, validating JWT token via socket connection).
- **Security**:
  - Validated Socket.IO connections via JWT parsing.
  - Checked JWT blacklist (Logout/Refresh tokens).
  - Guaranteed users can only access their specific conversations.
- **Frontend Integration**:
  - Implemented real-time updates via `socket.io-client`.
  - Used `Zustand` store for messaging state (`useMessagingStore`).
  - Unified `ChatLayout` for both Candidate and Employer portals.
  - Integrated a "Nhắn tin cho ứng viên" button directly on the Application Detail Page for Employers.

## 3. Deviations from Original Plan
- Employers can now directly initiate a conversation from an application view.
- Added candidate names fallback to emails since Candidate/User tables do not have dedicated `name` fields (or it was handled elsewhere).
- Ignored Redis Adapter as it is not needed for a single-node deployment (per AD-6).

## 4. Next Steps (Phase 10)
- The project is now ready for **Phase 10 (System Triggers & Emails)**, which will focus on offloading email delivery to a worker queue, tracking email logs, and possibly pushing push notifications for new messages.
