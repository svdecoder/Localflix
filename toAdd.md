# Localflix — Complete Feature Implementation

You are working on the existing **Localflix** project from `svdecoder` on GitHub.

The goal is to evolve the existing application into a polished, secure, Netflix-like personal media server while **preserving the existing architecture and functionality as much as reasonably possible**.

This is an existing project, NOT a greenfield project.

You must inspect and understand the existing code before modifying it.

---

# 0. CORE RULES

These rules apply to the entire implementation.

## Preserve the existing project

Do NOT rewrite the application from scratch.

Do NOT replace the existing architecture simply because you prefer another framework, library, database structure, or coding style.

Change as little as reasonably possible.

Reuse existing:

- Components
    
- Functions
    
- APIs
    
- Database access patterns
    
- FFmpeg functionality
    
- Player functionality
    
- Styling
    
- Utilities
    
- Dependencies
    

Only refactor existing code when:

1. It is necessary for a requested feature.
    
2. It fixes a real bug.
    
3. It prevents serious duplication.
    
4. It is required for security or performance.
    

If a refactor is necessary, explain why before performing it.

---

# 1. DEVELOPMENT PROCESS

This project will be implemented in multiple phases.

Do NOT immediately start changing code.

First perform **Phase 0 — Architecture Audit**.

After Phase 0, provide the implementation plan.

Then implement each phase sequentially.

Each feature inside a phase is a separate task.

Before starting each task:

- Explain what you are going to change.
    
- Explain which existing files/components you will reuse.
    
- Explain database changes.
    
- Explain API changes.
    
- Explain security considerations.
    
- Explain performance considerations.
    
- Explain compatibility considerations.
    

Then implement the task.

After each task:

- Run appropriate tests.
    
- Test the happy path.
    
- Test failure cases.
    
- Test authorization/security where applicable.
    
- Verify existing functionality still works.
    
- Report what changed.
    

Do not silently skip requirements.

If you encounter a blocker:

- Explain the problem.
    
- Explain possible solutions.
    
- Choose the safest solution only after explaining it.
    
- Never implement fake or simulated functionality.
    

---

# 2. PHASE 0 — ARCHITECTURE AUDIT

Do NOT modify the code during Phase 0.

Inspect the entire repository.

Analyze:

## Backend

- Application entry point
    
- API routes
    
- Controllers
    
- Services
    
- Database access
    
- Authentication, if any
    
- Authorization, if any
    
- Error handling
    
- Configuration
    
- Logging
    

## Frontend

- Pages
    
- Components
    
- JavaScript
    
- CSS
    
- Player
    
- Upload UI
    
- Search
    
- Movie pages
    
- Series pages
    

## Database

Inspect:

- Schema
    
- Relationships
    
- Foreign keys
    
- Indexes
    
- Existing migration system
    
- Existing data model
    

Pay particular attention to:

- Movies
    
- Series
    
- Seasons
    
- Episodes
    
- Media files
    
- Subtitles
    

## Media pipeline

Trace the complete flow:

Upload  
→ validation  
→ storage  
→ FFmpeg  
→ metadata  
→ database  
→ streaming  
→ playback

Inspect every FFmpeg command currently used.

Determine how large files are handled.

Determine how temporary files are handled.

Determine how FFmpeg failures are handled.

## Deployment

Inspect:

- Docker
    
- docker-compose
    
- Environment variables
    
- Volumes
    
- Database setup
    
- Production build
    

## Security

Identify:

- Path traversal risks
    
- Command injection risks
    
- Unsafe file handling
    
- Missing authorization
    
- Missing validation
    
- Exposed secrets
    
- Unsafe filesystem access
    
- Unsafe external API handling
    

## Testing

Identify existing tests and testing infrastructure.

---

# 3. PHASE 0 OUTPUT

Before modifying anything, provide:

1. Current architecture overview.
    
2. Current database model.
    
3. Current upload pipeline.
    
4. Current FFmpeg pipeline.
    
5. Current streaming architecture.
    
6. Current subtitle functionality.
    
7. Current authentication/security model.
    
8. Current frontend architecture.
    
9. Current testing infrastructure.
    
10. Existing bugs or weaknesses discovered.
    
11. Recommended architecture for the following phases.
    
12. Database changes likely required.
    
13. API changes likely required.
    
14. Compatibility risks.
    
15. Dependency changes likely required.
    
16. Detailed implementation order.
    

Do not modify files yet.

---

# 4. FUTURE-PROOFING

The following phases will eventually exist:

### Phase 1

- Subtitle improvements
    
- FFmpeg reliability
    
- Video compression
    
- Automatic next episode
    

### Phase 2

- Authentication
    
- Users
    
- Profiles
    
- Playback progress
    
- Continue Watching
    
- Admin permissions
    

### Phase 3

- Likes
    
- Watchlist
    
- Watch history
    
- Recommendations
    

### Phase 4

- Automatic metadata
    
- Automatic posters/artwork
    
- Improved upload workflow
    

### Phase 5

- Netflix-like UI/UX
    

### Phase 6

- Library scanning
    
- Collections
    
- Advanced search
    
- TV/PWA improvements
    

Do not implement future features prematurely.

However, database and service architecture must not make future phases unnecessarily difficult.

In particular, keep the conceptual distinction between:

- User account
    
- Profile
    
- Title
    
- Movie
    
- Series
    
- Season
    
- Episode
    
- Media file
    
- Subtitle
    
- Artwork
    
- Playback progress
    
- Watch history
    
- Watchlist
    
- Rating/like
    
- External metadata
    

A movie/series title should eventually be capable of having multiple media files or versions.

---

# 5. GLOBAL SECURITY REQUIREMENTS

Every phase must follow these requirements.

## Input validation

Never trust:

- Filenames
    
- MIME types
    
- File extensions
    
- IDs
    
- Paths
    
- Query parameters
    
- Form values
    
- JSON payloads
    
- External API data
    

Validate everything server-side.

## Filesystem security

Prevent:

- Path traversal
    
- Arbitrary file reads
    
- Arbitrary file writes
    
- Arbitrary file deletion
    
- Access outside configured media directories
    

Never directly concatenate untrusted input into filesystem paths.

Use safe path resolution and verify the resulting path remains inside the intended directory.

## FFmpeg security

Never construct unsafe shell commands from user-controlled strings.

Do not use unsafe shell interpolation.

Use safe argument passing.

Validate every FFmpeg argument derived from user input.

Capture:

- Exit status
    
- stdout where useful
    
- stderr
    
- Processing duration
    
- Errors
    

## Database security

Use parameterized queries or the project's equivalent safe database mechanism.

Never construct SQL queries using raw user input.

Add indexes where appropriate.

Use foreign keys and constraints where appropriate.

Avoid N+1 queries.

## Authorization

Security must be enforced server-side.

Never rely on hiding a button in the frontend.

Every protected API endpoint must independently verify permissions.

## Secrets

Never commit:

- Passwords
    
- API keys
    
- Session secrets
    
- Tokens
    
- Private credentials
    

Use environment variables/configuration.

## Errors

Do not expose:

- Stack traces
    
- Database credentials
    
- Filesystem paths unnecessarily
    
- FFmpeg commands containing secrets
    

Return useful but safe errors to users.

Log detailed diagnostics server-side where appropriate.

---

# 6. PHASE 1 — SUBTITLES, FFMPEG, COMPRESSION AND NEXT EPISODE

Implement each item below as a separate task.

---

## TASK 1 — Subtitle management

Improve the subtitle system.

### Requirements

Support uploading `.srt` files.

Users must be able to upload multiple subtitle files when uploading:

- A movie
    
- An episode
    

Users must also be able to add subtitles AFTER the movie/episode has already been uploaded.

Users must be able to:

- Upload subtitle
    
- Delete subtitle
    
- Select subtitle track
    
- Select language
    
- Adjust synchronization
    
- Reset synchronization
    

Each subtitle should have at minimum:

- ID
    
- Associated movie/episode/media ID
    
- Language
    
- Original filename
    
- Storage path
    
- Format
    
- Offset in milliseconds
    
- Created timestamp
    

Example:

`+1500 ms` means subtitles are shifted 1.5 seconds later.

`-1500 ms` means subtitles are shifted 1.5 seconds earlier.

### Important

Do NOT modify or re-encode the original video just because a subtitle offset changes.

The offset should be stored as metadata/configuration and applied during playback where possible.

Validate `.srt` files.

Do not trust filenames to determine language.

Allow the user to select the subtitle language manually.

Prevent subtitle files from being stored outside the intended media/subtitle directory.

Clean up failed uploads.

Do not create duplicate subtitle entries accidentally.

---

# TASK 2 — Large-file FFmpeg reliability

There are cases where FFmpeg fails when processing large files.

Do not blindly increase timeouts or change random FFmpeg options.

First investigate the actual cause.

Determine whether failures are related to:

- Memory
    
- Disk space
    
- Temporary storage
    
- File size
    
- Command construction
    
- Codec
    
- Container
    
- Timeout
    
- Permissions
    
- FFmpeg version
    
- Process handling
    
- Concurrent processing
    

Capture FFmpeg stderr and exit codes.

Make FFmpeg failures diagnosable.

Requirements:

- Detect failure correctly.
    
- Never mark a failed operation as successful.
    
- Never replace a valid media file with a partial file.
    
- Use temporary output files.
    
- Validate successful output.
    
- Atomically replace the original only after successful completion.
    
- Clean temporary files after failures.
    
- Keep database state consistent with filesystem state.
    

If processing is expensive, do not block the main application unnecessarily.

---

# TASK 3 — Video compression

Add a way to reduce video file size while maintaining visually indistinguishable quality.

Do NOT promise mathematically lossless compression unless it is actually lossless.

The goal is visually transparent or very high-quality compression.

Do not simply reduce resolution.

Prefer quality-based encoding such as CRF or the equivalent for the selected codec.

Requirements:

- Preserve resolution by default.
    
- Preserve frame rate.
    
- Preserve appropriate audio quality.
    
- Allow configurable quality settings.
    
- Show original file size.
    
- Show resulting file size.
    
- Show compression percentage.
    
- Show codec.
    
- Show resolution.
    
- Show encoding status.
    

Before encoding:

- Check whether re-encoding is likely to provide meaningful savings.
    
- Do not unnecessarily re-encode already efficiently compressed media.
    

Never delete the original until the new file:

- Successfully finishes encoding.
    
- Exists.
    
- Has a valid file size.
    
- Can be opened/validated.
    
- Is confirmed usable.
    

Use temporary files.

If the new file is invalid or larger than the original by an unreasonable amount, keep the original.

### Job management

Video encoding can be CPU-intensive.

Implement processing as a background job if compatible with the existing architecture.

By default:

- Run one expensive encoding job at a time.
    
- Queue additional jobs.
    
- Do not allow several large encodes to overload the server.
    

Design the queue so multiple workers could be supported later.

If hardware acceleration can safely be detected, support it without making the application dependent on specific hardware.

---

# TASK 4 — Automatic next episode

For series, implement automatic next episode functionality.

Requirements:

- Detect next episode based on season/episode ordering.
    
- Handle transitions between seasons.
    
- Detect when the current episode is near completion.
    
- Show a "Next Episode" button.
    
- Show a countdown before automatic playback.
    
- Allow cancellation.
    
- Do not start anything if there is no next episode.
    
- Correctly handle the final episode.
    
- Respect saved playback position once Phase 2 exists.
    

Use a configurable completion threshold.

Do not consider an episode watched merely because the player was opened.

The implementation must be compatible with the future playback-progress system.

---

# 7. PHASE 2 — AUTHENTICATION, USERS, PROFILES AND CONTINUE WATCHING

---

# TASK 5 — Authentication

Implement a secure login system.

There must be:

- Login
    
- Logout
    
- Secure sessions
    
- Password hashing
    
- Session expiration
    

Passwords must NEVER be stored in plaintext.

Use a strong password hashing algorithm such as Argon2id or bcrypt, depending on project compatibility.

Requirements:

- Secure password storage.
    
- Secure sessions.
    
- Session fixation protection.
    
- Session regeneration after authentication.
    
- Secure logout.
    
- Authentication middleware.
    
- Brute-force protection/rate limiting where appropriate.
    
- No sensitive credentials in logs.
    
- No secrets in source code.
    

The initial system should support an admin account.

The admin account must be configurable securely.

Do not hardcode a default production password.

---

# TASK 6 — Authorization / admin permissions

Implement role-based authorization.

At minimum:

### Admin

Can:

- Add movies
    
- Delete movies
    
- Add episodes
    
- Delete episodes
    
- Add series
    
- Delete series
    
- Manage media
    
- Manage subtitles
    
- Perform destructive operations
    
- Manage users where appropriate
    

### Normal user

Can:

- Watch media
    
- Manage their own profile(s)
    
- Manage their own watchlist
    
- Like titles
    
- View their own history
    
- Continue watching
    
- Change their own preferences
    

Normal users must NOT be able to perform admin operations.

Authorization must be checked on the backend for every protected operation.

Do not rely on frontend visibility.

---

# TASK 7 — User system

Implement user accounts.

A user account represents an authenticated person.

A user may own multiple profiles.

Example:

User:  
`Alex`

Profiles:

- Alex
    
- Kids
    
- Guest
    

User accounts and profiles are separate concepts.

---

# TASK 8 — Profiles

Each user can create and manage profiles.

Each profile should have its own:

- Name
    
- Avatar
    
- Watch history
    
- Playback progress
    
- Watchlist
    
- Likes
    
- Recommendations
    
- Preferences
    

Profiles belonging to the same user must not accidentally share private viewing data.

The user account owns the profiles.

The admin role belongs to the account, not the profile.

Implement profile selection similar to a Netflix-style "Who's watching?" screen.

---

# TASK 9 — Playback progress / Continue Watching

Track playback progress per profile and media item.

Store at minimum:

- Profile ID
    
- Media/movie/episode ID
    
- Current position in seconds
    
- Duration
    
- Percentage watched
    
- Last watched timestamp
    
- Completed/watched state
    

Save progress periodically during playback.

Also save progress:

- On pause
    
- On seek
    
- When leaving the player
    
- At playback completion
    

Do NOT write to the database on every video frame.

Use throttling/debouncing.

When a user returns to a partially watched item:

Show:

- Continue Watching
    
- Resume from saved position
    
- Start from beginning
    

Automatically mark media as watched only after a configurable percentage has been completed.

Build this as the foundation for the future Continue Watching homepage row.

---

# 8. PHASE 3 — LIKES, WATCHLIST, HISTORY AND RECOMMENDATIONS

---

# TASK 10 — Likes

Allow each profile to like titles.

At minimum:

- Like
    
- Remove like
    

Optionally support dislike if it is useful to the recommendation algorithm.

Likes must be profile-specific.

Do not duplicate likes.

---

# TASK 11 — My List / Watchlist

Each profile should have a personal watchlist.

Requirements:

- Add movie.
    
- Add series.
    
- Remove movie.
    
- Remove series.
    
- Show whether a title is already in the list.
    
- Dedicated My List section.
    
- Do not duplicate entries.
    
- Removing an item from My List must never delete the actual media.
    

---

# TASK 12 — Watch history

Create a watch history per profile.

Display:

- Title
    
- Episode if applicable
    
- Date watched
    
- Progress
    
- Completion state
    

Allow useful filtering/sorting.

History must be profile-specific.

Do not expose another profile's history.

Do not expose another user's history.

---

# TASK 13 — Recommendation system

Build an initial deterministic recommendation engine.

Do NOT introduce an LLM or expensive machine-learning system for the first version.

Use existing metadata and user behavior.

Recommendations should consider:

- Likes
    
- Watch history
    
- Watchlist
    
- Genres
    
- Tags
    
- Actors
    
- Directors
    
- Release year
    
- Series/franchise relationships
    
- Previously watched content
    

Avoid recommending titles that the profile has already completely watched unless appropriate.

Avoid repeatedly recommending the same title.

Create explainable recommendations.

Examples:

"Because you liked Dune"

"Because you watched Science Fiction"

"More from Christopher Nolan"

"Similar to The Matrix"

Implement the recommendation engine as an independent service/module so it can later be replaced with a more sophisticated algorithm.

---

# 9. PHASE 4 — METADATA AND AUTOMATIC ARTWORK

---

# TASK 14 — Automatic metadata matching

When uploading a movie or series, automatically attempt to identify it.

Use an external metadata provider API such as TMDB or another appropriate provider.

Do not assume a provider without checking the project's license/requirements and current API availability.

The workflow should be:

1. User selects/uploads file.
    
2. Parse filename.
    
3. Detect likely title.
    
4. Detect release year if available.
    
5. Detect season/episode if applicable.
    
6. Search external metadata provider.
    
7. Display candidate results.
    
8. User confirms the correct title.
    
9. Fetch metadata.
    
10. Store metadata locally.
    
11. Store the external provider ID.
    

Do NOT make the application dependent on the external API being available during normal playback.

Once metadata has been imported, it should remain usable locally.

Allow manual metadata correction.

Store external IDs so metadata can be refreshed later.

---

# TASK 15 — Movie metadata

Where available, support:

- Title
    
- Original title
    
- Description
    
- Release date
    
- Runtime
    
- Genres
    
- Tags
    
- Rating
    
- Age certification
    
- Director
    
- Cast
    
- Production companies/studios
    
- External IDs
    
- Poster
    
- Backdrop
    

Do not download information unnecessarily.

Cache metadata locally.

---

# TASK 16 — Series metadata

Support:

- Series title
    
- Description
    
- Release date
    
- Genres
    
- Cast
    
- Creators
    
- Studios
    
- Seasons
    
- Episodes
    
- Episode descriptions
    
- Episode release dates
    
- Episode runtime
    
- Episode artwork
    
- External IDs
    
- Poster
    
- Backdrop
    

Automatically associate episodes with the correct season and episode number when possible.

Allow manual correction.

---

# TASK 17 — Artwork

Automatically fetch artwork for:

- Movies
    
- Series
    
- Seasons where available
    
- Episodes where available
    

At minimum support:

- Poster
    
- Backdrop/banner
    

Cache artwork locally.

Do not request external artwork every time a page loads.

If the metadata provider becomes unavailable, previously downloaded artwork must continue working.

Allow administrators to manually replace artwork.

Validate downloaded files before storing them.

Do not blindly trust arbitrary external URLs.

---

# TASK 18 — Improved upload workflow

Create a better upload experience.

For a movie upload:

1. Select video.
    
2. Validate file.
    
3. Extract technical metadata.
    
4. Parse filename.
    
5. Search for metadata.
    
6. Display candidate titles.
    
7. Allow user confirmation/correction.
    
8. Select/upload multiple subtitles.
    
9. Select subtitle languages.
    
10. Display artwork.
    
11. Allow artwork replacement.
    
12. Confirm upload.
    
13. Process media.
    
14. Show processing progress.
    
15. Display final result.
    

For an episode:

- Detect series.
    
- Detect season.
    
- Detect episode.
    
- Confirm metadata.
    
- Upload subtitles.
    
- Fetch artwork.
    
- Process.
    

Only administrators can perform uploads.

---

# 10. DATA MODEL REQUIREMENTS

Before implementing database changes, carefully inspect the existing schema.

Prefer additive migrations over destructive schema replacement.

Do not delete existing data.

Where appropriate, maintain separate concepts for:

- Users
    
- Profiles
    
- Titles
    
- Movies
    
- Series
    
- Seasons
    
- Episodes
    
- Media files
    
- Subtitles
    
- Artwork
    
- Playback progress
    
- Watch history
    
- Likes
    
- Watchlist
    
- External metadata
    

The design should eventually support multiple media files for a title.

For example:

Movie:  
`Dune`

Media:

- 1080p version
    
- 4K version
    
- compressed version
    

Do not unnecessarily implement multiple versions now if the existing architecture does not need them, but avoid designing the schema in a way that prevents them later.

---

# 11. DATABASE REQUIREMENTS

For every new table:

Consider:

- Primary keys
    
- Foreign keys
    
- Unique constraints
    
- Cascading behavior
    
- Indexes
    
- Timestamps
    

Use indexes for common queries such as:

- User → profiles
    
- Profile → progress
    
- Profile → history
    
- Profile → watchlist
    
- Profile → likes
    
- Series → seasons
    
- Season → episodes
    
- Title → media
    
- Media → subtitles
    

Avoid unnecessary indexes where they would significantly hurt write performance.

Never silently delete related user data.

Be especially careful with cascading deletes.

For example, deleting a movie should not accidentally delete unrelated users or profiles.

---

# 12. PHASE 5 — NETFLIX-LIKE UI/UX

After the backend features are stable, improve the frontend.

Do NOT redesign the entire frontend unnecessarily.

Keep the existing visual identity where possible while evolving it toward a polished Netflix-like experience.

---

# TASK 19 — Homepage

Create a Netflix-style homepage containing rows such as:

- Hero title
    
- Continue Watching
    
- My List
    
- Recently Added
    
- Because You Watched...
    
- Recommended For You
    
- Genres
    
- Popular in Your Library
    
- Recently Watched
    

Rows should be horizontally scrollable.

Cards should clearly display:

- Poster
    
- Title
    
- Progress bar when applicable
    
- Watch state where appropriate
    

---

# TASK 20 — Hero section

Create a large hero area for selected titles.

Display:

- Backdrop
    
- Title
    
- Description
    
- Release year
    
- Runtime
    
- Genre
    
- Rating if available
    
- Play button
    
- Add to My List
    

Avoid unnecessarily loading huge images.

Use optimized responsive artwork.

---

# TASK 21 — Title detail page

Create polished movie/series detail pages.

Movie page:

- Backdrop
    
- Poster
    
- Title
    
- Description
    
- Metadata
    
- Play
    
- Continue Watching
    
- My List
    
- Like
    
- Cast
    
- Similar titles
    

Series page:

- Backdrop
    
- Description
    
- Metadata
    
- Continue Watching
    
- Seasons selector
    
- Episode list
    
- Episode thumbnails
    
- Episode descriptions
    
- Episode progress
    

---

# TASK 22 — Search

Improve search.

Search should find:

- Movies
    
- Series
    
- Episodes
    
- People where metadata exists
    
- Genres
    
- Tags
    

Use debounced search.

Do not query the database on every individual keystroke.

Use appropriate indexes.

Display results in a polished Netflix-like layout.

---

# TASK 23 — Player improvements

Keep the existing player functionality.

Improve it with:

- Resume playback
    
- Start from beginning
    
- Subtitle selection
    
- Subtitle synchronization
    
- Audio selection
    
- Playback speed
    
- Next episode
    
- Previous episode where appropriate
    
- Chapters if available
    
- Fullscreen
    
- Picture-in-picture where supported
    
- Keyboard shortcuts
    
- Mobile controls
    

Do not break existing streaming behavior.

---

# TASK 24 — Preview behavior

Where practical, support preview behavior for content cards.

Do not generate expensive previews for the entire library unless explicitly configured.

If previews are implemented:

- Generate them asynchronously.
    
- Store them separately.
    
- Do not block normal media playback.
    
- Allow the feature to be disabled.
    

---

# 13. PHASE 6 — LIBRARY AND MEDIA-SERVER FEATURES

These should only be implemented after the previous phases are stable.

---

# TASK 25 — Library scanner

Add optional folder-based library scanning.

For example:

`/media/movies`

`/media/tv`

The scanner should:

- Detect new media.
    
- Detect removed media.
    
- Detect renamed files where possible.
    
- Parse filenames.
    
- Match metadata.
    
- Detect duplicates.
    
- Avoid importing the same media twice.
    

Scanning should run in the background.

Do not block the application during large scans.

---

# TASK 26 — Collections

Support collections/franchises.

Examples:

- Star Wars
    
- Harry Potter
    
- Marvel
    
- Lord of the Rings
    

Automatically use metadata collections where available.

Also allow administrators to create custom collections.

---

# TASK 27 — Advanced search and filtering

Add filtering by:

- Genre
    
- Year
    
- Rating
    
- Actor
    
- Director
    
- Language
    
- Subtitle availability
    
- Resolution
    
- Watched/unwatched
    
- Movie/series
    

Keep search performant.

---

# 14. MEDIA PROCESSING JOB SYSTEM

If the existing architecture does not already provide a job system, implement a lightweight one where necessary.

Jobs may include:

- FFmpeg processing
    
- Video compression
    
- Thumbnail generation
    
- Artwork processing
    
- Metadata fetching
    
- Library scanning
    

Each job should have:

- ID
    
- Type
    
- Status
    
- Progress
    
- Created timestamp
    
- Started timestamp
    
- Finished timestamp
    
- Error information
    

Statuses:

- queued
    
- processing
    
- completed
    
- failed
    
- cancelled
    

Do not allow multiple expensive jobs to overload the server.

Use a single worker by default for CPU-intensive video jobs.

Make the worker architecture extensible.

---

# 15. FILE HANDLING

For every uploaded file:

1. Validate size.
    
2. Validate extension.
    
3. Validate actual file type where practical.
    
4. Generate a safe internal filename/ID.
    
5. Never use the original filename directly as a trusted filesystem path.
    
6. Store outside publicly writable web directories where appropriate.
    
7. Process using temporary paths.
    
8. Validate successful processing.
    
9. Atomically move the final file into place.
    
10. Clean up failures.
    

Never execute uploaded files.

Never trust client-provided MIME types.

---

# 16. PERFORMANCE

Optimize carefully.

Do not prematurely optimize everything.

However:

- Avoid N+1 database queries.
    
- Add indexes for frequently queried fields.
    
- Paginate large lists.
    
- Lazy-load large artwork where appropriate.
    
- Use responsive images.
    
- Debounce search.
    
- Throttle playback-progress updates.
    
- Do expensive FFmpeg operations asynchronously.
    
- Avoid loading the entire media file into memory.
    
- Use streaming/range requests for playback.
    
- Avoid unnecessary external API calls.
    
- Cache metadata/artwork.
    
- Do not repeatedly regenerate thumbnails.
    

---

# 17. BACKWARD COMPATIBILITY

Existing Localflix functionality must continue working.

After every major phase verify:

- Existing movies still play.
    
- Existing series still work.
    
- Existing episodes still work.
    
- Existing uploads still work.
    
- Existing subtitles still work.
    
- Existing search still works.
    
- Existing streaming still works.
    
- Existing Docker setup still works.
    
- Existing database data remains usable.
    

Do not require users to delete and recreate their library.

If a migration is necessary:

- Make it explicit.
    
- Make it reversible where practical.
    
- Provide migration instructions.
    

---

# 18. TESTING

For every feature, test:

## Normal behavior

- Correct inputs
    
- Correct permissions
    
- Normal media
    

## Invalid input

- Invalid IDs
    
- Missing files
    
- Invalid subtitle files
    
- Unsupported extensions
    
- Corrupted media
    
- Oversized uploads
    

## Security

- Unauthorized access
    
- User accessing another user's profile
    
- User accessing another profile's history
    
- User attempting admin actions
    
- Path traversal attempts
    
- Arbitrary file access attempts
    
- Malicious filenames
    
- Malicious subtitle paths
    
- FFmpeg command injection attempts
    

## Media

- Small videos
    
- Large videos
    
- Movies
    
- Multiple episodes
    
- Multiple subtitles
    
- Different subtitle offsets
    
- FFmpeg failures
    
- Interrupted processing
    

## Database

- Missing relationships
    
- Duplicate operations
    
- Deleted media
    
- Failed migrations
    

---

# 19. NO FAKE FUNCTIONALITY

Do not create placeholder functionality that looks real but does not work.

Do not:

- Hardcode users
    
- Hardcode recommendations
    
- Fake metadata
    
- Fake progress
    
- Fake FFmpeg jobs
    
- Fake API responses
    
- Ignore errors
    
- Silently swallow failures
    

If something cannot be implemented, explain why.

---

# 20. DOCUMENTATION

Update documentation where appropriate.

Document:

- Installation
    
- Environment variables
    
- Database setup
    
- Database migrations
    
- FFmpeg requirements
    
- External metadata API setup
    
- Authentication
    
- Admin account setup
    
- Media directories
    
- Subtitle directories
    
- Job processing
    
- Production deployment
    
- Docker usage
    

Do not document functionality that does not actually exist.

---

# 21. FINAL VALIDATION

Before declaring the project complete:

1. Run all existing tests.
    
2. Run all new tests.
    
3. Build the frontend/backend.
    
4. Verify the application starts.
    
5. Verify the database migration on a clean database.
    
6. Verify an existing database can migrate without losing data.
    
7. Test login.
    
8. Test admin permissions.
    
9. Test normal user permissions.
    
10. Test profiles.
    
11. Test playback progress.
    
12. Test Continue Watching.
    
13. Test subtitles.
    
14. Test subtitle synchronization.
    
15. Test multiple subtitles.
    
16. Test large video processing.
    
17. Test compression.
    
18. Test next episode.
    
19. Test metadata fetching.
    
20. Test artwork.
    
21. Test search.
    
22. Test watchlist.
    
23. Test likes.
    
24. Test history.
    
25. Test recommendations.
    
26. Test deletion.
    
27. Test invalid uploads.
    
28. Test path traversal protection.
    
29. Test FFmpeg failure handling.
    
30. Verify no secrets are committed.
    
31. Verify no debug credentials remain.
    
32. Verify temporary files are cleaned up.
    

Fix any discovered regressions before final delivery.

---

# 22. TASK REPORTING

At the end of every task, report:

### Task

Name of task.

### Changes

Files modified and what changed. 

### Database

Tables/migrations/indexes changed.

### API

New/modified endpoints.

### Frontend

Components/pages changed.

### Dependencies

New dependencies, if any.

### Security

Security considerations implemented.

### Performance

Performance considerations implemented.

### Tests

Tests performed and their results.

### Known limitations

Anything that remains unresolved.

Do not simply say "done."

---

# 23. FINAL REPORT

At the end of the entire project provide:

## Features implemented

Complete list.

## Architecture

Explain the resulting architecture.

## Database

Explain all new tables/relationships/migrations.

## API

List new and modified endpoints.

## Authentication

Explain users, profiles and permissions.

## Media processing

Explain FFmpeg processing and job handling.

## Subtitle system

Explain subtitle storage and synchronization.

## Recommendation system

Explain how recommendations are generated.

## Metadata

Explain external metadata integration and caching.

## Artwork

Explain artwork fetching and caching.

## Security

Explain security protections.

## Performance

Explain performance optimizations.

## Testing

List all tests performed.

## Known limitations

Be honest about remaining limitations.

## Installation

Give exact installation and migration instructions.

---

# 24. FINAL ZIP

Only after all implementation and testing is complete:

Create the final project ZIP.

The ZIP must contain:

- Source code
    
- Database migrations
    
- Configuration examples
    
- Documentation
    
- Tests
    
- Required project files
    

Do NOT include:

- `node_modules`
    
- Build caches
    
- Temporary FFmpeg files
    
- Uploaded movies
    
- Uploaded subtitles
    
- Generated media
    
- Logs
    
- Secrets
    
- API keys
    
- Passwords
    
- Session data
    
- Development databases unless explicitly required
    

Verify that the ZIP can be extracted and used to install the project from scratch.

---

# MOST IMPORTANT INSTRUCTION

This is an existing project.

**Do not rewrite Localflix.**

Preserve the existing code and functionality wherever possible.

Implement features incrementally.

Prefer small, understandable changes over massive refactors.

Before changing architecture, prove that the existing architecture cannot support the requested feature.

Before changing the database, inspect the current schema and migration strategy.

Before changing FFmpeg, inspect the existing commands and determine the actual cause of failures.

Before adding a dependency, determine whether the existing project can already accomplish the task.

The final result should feel like a natural evolution of Localflix, not an unrelated application built on top of it.

The ultimate goal is:

**A secure, self-hosted, Netflix-like media server for locally owned media, with a polished user experience, profiles, personalization, reliable media processing, subtitles, recommendations, metadata and artwork.**