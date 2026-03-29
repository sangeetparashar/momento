import prisma from './prisma';

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: 'default' | null;
  badge?: number;
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Sends push notifications via Expo's push notification service.
 * Handles batching and filters out invalid tokens.
 * Push is best-effort — failures are logged but don't block.
 */
async function sendPushNotifications(messages: ExpoPushMessage[]): Promise<void> {
  if (messages.length === 0) return;

  // Filter out empty tokens
  const validMessages = messages.filter((m) => m.to && m.to.length > 0);
  if (validMessages.length === 0) return;

  // Expo recommends batches of 100
  const batchSize = 100;
  for (let i = 0; i < validMessages.length; i += batchSize) {
    const batch = validMessages.slice(i, i + batchSize);
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batch),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Expo push notification error:', errorText);
      }
    } catch (error) {
      console.error('Failed to send push notifications:', error);
    }
  }
}

/**
 * Saves a notification to the database AND attempts push delivery.
 * This ensures notifications are always stored server-side even if
 * push fails (no FCM, no token, Expo Go, etc.).
 */
async function createAndPushNotification({
  userId,
  type,
  title,
  body,
  data,
}: {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, any>;
}): Promise<void> {
  // 1. Always save to DB (guaranteed delivery when user opens notifications)
  try {
    await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        body,
        data: data ?? {},
      },
    });
  } catch (err) {
    console.error('Failed to save notification to DB:', err);
  }

  // 2. Best-effort push notification
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { pushToken: true },
    });

    if (user?.pushToken) {
      await sendPushNotifications([
        {
          to: user.pushToken,
          title,
          body,
          data: { type, ...data },
          sound: 'default',
        },
      ]);
    }
  } catch (err) {
    // Push failure is non-critical — notification is already in DB
    console.warn('Push delivery failed (notification saved to DB):', err);
  }
}

/**
 * Notifies all followers of a creator when a new post is published.
 */
export async function notifyNewPost(
  creatorId: string,
  creatorName: string,
  postId: string
): Promise<void> {
  // Get all followers
  const followers = await prisma.follow.findMany({
    where: { followingId: creatorId },
    select: {
      followerId: true,
      follower: { select: { pushToken: true } },
    },
  });

  // Save notification for each follower + push
  const promises = followers.map((f) =>
    createAndPushNotification({
      userId: f.followerId,
      type: 'new_post',
      title: 'New Post',
      body: `${creatorName} just shared a new momento!`,
      data: { postId, creatorId },
    })
  );

  await Promise.allSettled(promises);
}

/**
 * Notifies a post creator when someone comments on their post.
 */
export async function notifyNewComment(
  postCreatorId: string,
  commenterName: string,
  postId: string,
  commentPreview: string
): Promise<void> {
  const truncatedPreview =
    commentPreview.length > 80 ? commentPreview.slice(0, 77) + '...' : commentPreview;

  await createAndPushNotification({
    userId: postCreatorId,
    type: 'new_comment',
    title: 'New Comment',
    body: `${commenterName}: ${truncatedPreview}`,
    data: { postId },
  });
}

/**
 * Notify a user when someone follows them.
 */
export async function notifyNewFollow(
  followedUserId: string,
  followerName: string
): Promise<void> {
  await createAndPushNotification({
    userId: followedUserId,
    type: 'new_follow',
    title: 'New Follower',
    body: `${followerName} started following you!`,
    data: {},
  });
}

/**
 * Notify a post creator when someone likes their post.
 */
export async function notifyNewLike(
  postCreatorId: string,
  likerName: string,
  postId: string
): Promise<void> {
  await createAndPushNotification({
    userId: postCreatorId,
    type: 'new_like',
    title: 'New Like',
    body: `${likerName} liked your momento!`,
    data: { postId },
  });
}

/**
 * Notifies a user when their creator application is approved by admin.
 */
export async function notifyCreatorApproval(
  userId: string,
  approved: boolean
): Promise<void> {
  await createAndPushNotification({
    userId,
    type: 'creator_approval',
    title: approved ? 'Creator Application Approved!' : 'Creator Application Update',
    body: approved
      ? 'Congratulations! You are now a verified creator on Momento.'
      : 'Your creator application needs more information. Please re-apply.',
    data: { approved },
  });
}
