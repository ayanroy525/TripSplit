-- ==============================================================================
-- Migration: 007_invite_code_procedures.sql
-- Description:
--   1. Secure Stored Procedures for Validating and Joining Trips by Invite Code
--      - get_trip_by_invite_code: Safe preview lookup without leaking other trips
--      - join_trip_by_invite_code: Atomic join operation handling trip_members,
--        trips.member_user_ids, and activity log in a single transaction.
--   2. RLS Security: SECURITY DEFINER ensures users not yet in member_user_ids
--      can validate and join trips cleanly without permission denial.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. PREVIEW TRIP BY INVITE CODE
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_trip_by_invite_code(p_invite_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip RECORD;
  v_members JSONB;
  v_clean_code TEXT;
BEGIN
  IF p_invite_code IS NULL OR TRIM(p_invite_code) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'CODE_REQUIRED',
      'message', 'Please enter an invite code.'
    );
  END IF;

  v_clean_code := UPPER(TRIM(p_invite_code));
  
  -- Find the trip with matching invite_code (case-insensitive)
  SELECT * INTO v_trip
  FROM public.trips
  WHERE UPPER(TRIM(invite_code)) = v_clean_code
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_CODE',
      'message', 'Invite code ' || quote_literal(v_clean_code) || ' is invalid or expired. Please check with your trip organizer.'
    );
  END IF;

  -- Check expiration if invite_expires_at is set
  IF v_trip.invite_expires_at IS NOT NULL AND v_trip.invite_expires_at < NOW() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'EXPIRED',
      'message', 'This invite code has expired. Please ask the trip organizer for a new one.'
    );
  END IF;

  -- Get existing members list for preview
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', tm.id,
      'userId', tm.user_id,
      'name', tm.name,
      'role', tm.role,
      'avatarColor', tm.avatar_color,
      'phone', tm.phone,
      'email', tm.email,
      'joinedAt', tm.joined_at
    )
  ), '[]'::jsonb) INTO v_members
  FROM public.trip_members tm
  WHERE tm.trip_id = v_trip.id;

  RETURN jsonb_build_object(
    'success', true,
    'trip', jsonb_build_object(
      'id', v_trip.id,
      'title', v_trip.title,
      'location', COALESCE(v_trip.location, v_trip.destination, ''),
      'destination', COALESCE(v_trip.destination, v_trip.location, ''),
      'startDate', v_trip.start_date,
      'endDate', v_trip.end_date,
      'currency', COALESCE(v_trip.currency, 'INR'),
      'status', COALESCE(v_trip.status, 'ACTIVE'),
      'ownerId', v_trip.owner_id,
      'ownerName', v_trip.owner_name,
      'inviteCode', v_trip.invite_code,
      'inviteExpiresAt', v_trip.invite_expires_at,
      'memberUserIds', COALESCE(v_trip.member_user_ids, '[]'::jsonb),
      'createdAt', v_trip.created_at,
      'members', v_members
    )
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. ATOMIC JOIN TRIP BY INVITE CODE
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.join_trip_by_invite_code(
  p_invite_code TEXT,
  p_user JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip RECORD;
  v_clean_code TEXT;
  v_user_id TEXT;
  v_user_name TEXT;
  v_user_email TEXT;
  v_user_phone TEXT;
  v_avatar_color TEXT;
  v_member_id TEXT;
  v_existing_member RECORD;
  v_members JSONB;
  v_is_already_member BOOLEAN := false;
  v_current_ids_arr TEXT[];
  v_updated_ids_json JSONB;
BEGIN
  IF p_invite_code IS NULL OR TRIM(p_invite_code) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'CODE_REQUIRED',
      'message', 'Please enter an invite code.'
    );
  END IF;

  v_clean_code := UPPER(TRIM(p_invite_code));
  
  v_user_id := p_user->>'id';
  IF v_user_id IS NULL OR v_user_id = '' THEN
    v_user_id := p_user->>'userId';
  END IF;

  IF v_user_id IS NULL OR v_user_id = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'USER_REQUIRED',
      'message', 'User account identification is required to join a trip.'
    );
  END IF;

  v_user_name := COALESCE(NULLIF(TRIM(p_user->>'name'), ''), 'Traveler');
  v_user_email := NULLIF(TRIM(p_user->>'email'), '');
  v_user_phone := NULLIF(TRIM(p_user->>'phone'), '');
  v_avatar_color := COALESCE(NULLIF(p_user->>'avatarColor', ''), NULLIF(p_user->>'avatar_color', ''), '#0F6B65');

  -- 1. Find trip by invite code
  SELECT * INTO v_trip
  FROM public.trips
  WHERE UPPER(TRIM(invite_code)) = v_clean_code
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_CODE',
      'message', 'Invite code ' || quote_literal(v_clean_code) || ' is invalid or expired. Please check with your trip organizer.'
    );
  END IF;

  -- 2. Check expiration
  IF v_trip.invite_expires_at IS NOT NULL AND v_trip.invite_expires_at < NOW() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'EXPIRED',
      'message', 'This invite code has expired. Please ask the trip organizer for a new one.'
    );
  END IF;

  -- 3. Check if user is already a member
  SELECT * INTO v_existing_member
  FROM public.trip_members
  WHERE trip_id = v_trip.id
    AND (user_id = v_user_id OR id = v_user_id)
  LIMIT 1;

  IF FOUND THEN
    v_is_already_member := true;
  ELSE
    -- 4. Check if there's a placeholder member matching email or phone to link
    IF v_user_email IS NOT NULL OR v_user_phone IS NOT NULL THEN
      SELECT * INTO v_existing_member
      FROM public.trip_members
      WHERE trip_id = v_trip.id
        AND (
          (v_user_email IS NOT NULL AND LOWER(email) = LOWER(v_user_email))
          OR (v_user_phone IS NOT NULL AND phone IS NOT NULL AND RIGHT(REGEXP_REPLACE(phone, '\D', '', 'g'), 10) = RIGHT(REGEXP_REPLACE(v_user_phone, '\D', '', 'g'), 10))
        )
      LIMIT 1;
    END IF;

    IF FOUND THEN
      -- Link existing placeholder member record
      UPDATE public.trip_members
      SET user_id = v_user_id,
          name = COALESCE(NULLIF(trip_members.name, 'Traveler'), v_user_name),
          avatar_color = COALESCE(trip_members.avatar_color, v_avatar_color),
          phone = COALESCE(trip_members.phone, v_user_phone),
          email = COALESCE(trip_members.email, v_user_email)
      WHERE id = v_existing_member.id;
      v_member_id := v_existing_member.id;
    ELSE
      -- Insert brand new member row with participant role
      v_member_id := v_user_id;
      INSERT INTO public.trip_members (
        id,
        trip_id,
        user_id,
        name,
        role,
        avatar_color,
        phone,
        email,
        joined_at,
        status
      ) VALUES (
        v_member_id,
        v_trip.id,
        v_user_id,
        v_user_name,
        'participant',
        v_avatar_color,
        v_user_phone,
        v_user_email,
        NOW(),
        'active'
      )
      ON CONFLICT (id) DO UPDATE SET
        trip_id = v_trip.id,
        user_id = v_user_id,
        name = EXCLUDED.name,
        avatar_color = EXCLUDED.avatar_color,
        phone = COALESCE(EXCLUDED.phone, trip_members.phone),
        email = COALESCE(EXCLUDED.email, trip_members.email);
    END IF;

    -- 5. Atomically update trips.member_user_ids array
    SELECT ARRAY(
      SELECT DISTINCT elem
      FROM (
        SELECT jsonb_array_elements_text(COALESCE(v_trip.member_user_ids, '[]'::jsonb)) AS elem
        UNION
        SELECT v_user_id AS elem
        UNION
        SELECT v_trip.owner_id AS elem
      ) sub
      WHERE elem IS NOT NULL AND elem <> ''
    ) INTO v_current_ids_arr;

    v_updated_ids_json := to_jsonb(v_current_ids_arr);

    UPDATE public.trips
    SET member_user_ids = v_updated_ids_json,
        updated_at = NOW()
    WHERE id = v_trip.id;

    -- 6. Insert activity log entry
    INSERT INTO public.activities (
      id,
      trip_id,
      ts,
      user_name,
      action,
      detail,
      actor_id,
      created_at
    ) VALUES (
      'act_' || floor(extract(epoch from now()) * 1000)::text,
      v_trip.id,
      'Just now',
      v_user_name,
      'joined',
      v_user_name || ' joined the trip via invite code',
      v_user_id,
      NOW()
    );
  END IF;

  -- 7. Fetch all members for this trip to return
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', tm.id,
      'userId', tm.user_id,
      'name', tm.name,
      'role', tm.role,
      'avatarColor', tm.avatar_color,
      'phone', tm.phone,
      'email', tm.email,
      'joinedAt', tm.joined_at
    )
  ), '[]'::jsonb) INTO v_members
  FROM public.trip_members tm
  WHERE tm.trip_id = v_trip.id;

  RETURN jsonb_build_object(
    'success', true,
    'already_member', v_is_already_member,
    'trip_id', v_trip.id,
    'trip_title', v_trip.title,
    'trip', jsonb_build_object(
      'id', v_trip.id,
      'title', v_trip.title,
      'location', COALESCE(v_trip.location, v_trip.destination, ''),
      'destination', COALESCE(v_trip.destination, v_trip.location, ''),
      'startDate', v_trip.start_date,
      'endDate', v_trip.end_date,
      'currency', COALESCE(v_trip.currency, 'INR'),
      'status', COALESCE(v_trip.status, 'ACTIVE'),
      'ownerId', v_trip.owner_id,
      'ownerName', v_trip.owner_name,
      'inviteCode', v_trip.invite_code,
      'inviteExpiresAt', v_trip.invite_expires_at,
      'memberUserIds', COALESCE(v_updated_ids_json, v_trip.member_user_ids),
      'createdAt', v_trip.created_at,
      'members', v_members
    )
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. PERMISSIONS GRANT
-- ------------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION public.get_trip_by_invite_code(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.join_trip_by_invite_code(TEXT, JSONB) TO anon, authenticated, service_role;
