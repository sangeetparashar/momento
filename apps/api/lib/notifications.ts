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
 * Notifies all followers of a creator when a new post is published.
 */
export async function notifyNewPost(
  creatorId: string,
  creatorName: string,
  postId: string
): Promise<void> {
  // Get all followers who have push tokens
  const followers = await prisma.follow.findMany({
    where: { followingId: creatorId },
    include: {
      follower: {
        select: { pushToken: true },
      },
    },
  });

  const messages: ExpoPushMessage[] = followers
    .filter((f) => f.follower.pushToken)
    .map((f) => ({
      to: f.follower.pushToken!,
      title: 'New Post',
      body: `${creatorName} just shared a new momento!`,
      data: { type: 'new_post', postId, creatorId },
      sound: 'default' as const,
    }));

  await sendPushNotifications(messages);
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
  const creator = await prisma.user.findUnique({
    where: { id: postCreatorId },
    select: { pushToken: true },
  });

  if (!creator?.pushToken) return;

  const truncatedPreview =
    commentPreview.length > 80 ? commentPreview.slice(0, 77) + '...' : commentPreview;

  await sendPushNotifications([
    {
      to: creator.pushToken,
      title: 'New Comment',
      body: `${commenterName}: ${truncatedPreview}`,
      data: { type: 'new_comment', postId },
      sound: 'default',
    },
  ]);
}

/**
 * Notifies a user when their creator application is approved by admin.
 */
export async function notifyCreatorApproval(
  userId: string,
  approved: boolean
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { pushToken: true },
  });

  if (!user?.pushToken) return;

  await sendPushNotifications([
    {
      to: user.pushToken,
      title: approved ? 'Creator Application Approved!' : 'Creator Application Update',
      body: approved
        ? 'Congratulations! You are now a verified creator on Momento.'
        : 'Your creator application needs more information. Please re-apply.',
      data: { type: 'creator_approval', approved },
      sound: 'default',
    },
  ]);
}
