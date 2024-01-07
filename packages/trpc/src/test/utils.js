import { prisma } from "@recipesage/prisma";
import { createTRPCProxyClient, httpLink } from "@trpc/client";
import superjson from "superjson";

export async function trpcSetup() {
    const user = await createUser();
    const session = await createSession(user.id);
    const trpc = await createTrpcClient(session.token);
    return { user, session, trpc }
}

export async function tearDown(userId) {
    await prisma.user.delete({
        where: {
            id: userId
        }
    })
}

export async function createTrpcClient(token) {
    return createTRPCProxyClient({
    links: [
      httpLink({
        url: "http://localhost:80/api/trpc",
        headers: () => {
          return {
            Authorization: token ? `Bearer ${token}` : undefined,
          };
        },
      }),
    ],
    transformer: superjson,
  });
}

export async function createUser() {
  return prisma.user.create({
    data: {
      name: `${randomString(10)} ${randomString(10)}`,
      email: randomEmail(),
      passwordHash:
        "SaVNC9ubXV8BHykB2wAD0mhxPwh/W7O7Rz+qRy/PeV+GeeakLzkv2TSghPQvLTe07b7TqxdsRUt39lC3RaaWmhORkVS9UbtEIh9dzvcbj9VzHA0ex0k97nv0lE56Jh6D6M5Laxe2BrkpiUibP3yCDCk75vCHtLGTZVjqtabTGheIs/QwiD72C7H+bK4QSL2RYSOEbB0wysNAC5nF8r1m36FB/DS5wEixOWiQH470H1s9yHODAALNag9Lom+It4P3cMSSa83mxPNvFOniEpuDDcI5W/Oxef/XiA3EhMLL8n4+CSV1Z891g65U7j7RIKSCjK1LbCvQ5JuS/jZCErNBW9472TXdGKGeYY6RTDgSBzqISyxlMCSRBsNjToWHJyPEyEbt0BTSjTkliB+0wSQpdzUiDDiJNrLVimAriH/AcU/eFvpU5YyyY1coY8Kc80LxKxP/p881Q0DABCmaRcDH+/1iEz3SoWNvSsw/Xq8u9LcgKCjccDoD8tKBDkMijS7TBPu9zJd2nUqblPO+KTGz7hVqh/u0VQ+xEdvRQuKSc+4OnUtQRVCAFQGB99hfXfQvffeGosNy3BABEuZkobaUgs8m8RTaRFGqy8qk6BYw1bk5I5KjjmA8GNOtNHlKQ+1EZO83pIKbG61Jfm93FJ6CsWji9fXsxaBsv+JNBhRgmUw=",
      passwordSalt:
        "dM4YXu5N5XY4c0LXnf30vtshh7dgsBYZ/5pZockgcJofPkWhMOplVAoWKhyqODZhO3mSUBqMqo3kXC2+7fOMt1NFB0Q1iRcJ4zaqAqdTenyjXu7rJ8WpgR1qnTcnpP8g/frQ+sk8Kcv49OC84R3v+FD8RrGm0rz8dDt7m7c/+Rw=",
      passwordVersion: 2,
    },
  });
}

export const createSession = (userId) => {
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  return prisma.session.create({
    data: {
      userId,
      token: randomString(40),
      type: "user",
      expires: tomorrow,
    },
  });
};

export function randomEmail() {
  return `${randomString(20)}@gmail.com`;
}

export function randomString(len) {
  let chars = "abcdefghijklmnopqrstuvwxyz";

  let str = [];
  for (let i = 0; i < len; i++)
    str.push(chars.charAt(Math.floor(Math.random() * (chars.length - 1))));

  return str.join("");
}
