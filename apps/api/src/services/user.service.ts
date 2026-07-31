import type { AuthSessionResponse, UserSummary, UsersResponse } from "@verilot/contracts";

import {
  userRepository,
  type UserRepository,
  type UserSummaryRecord,
} from "../repositories/user.repository.js";

function toUserSummary(user: UserSummaryRecord): UserSummary {
  return {
    displayName: user.displayName,
    email: user.email,
    id: user.id,
    organization: {
      id: user.organization.id,
      name: user.organization.name,
      type: user.organization.type,
    },
    role: user.role,
    status: user.status,
  };
}

export class UserService {
  public constructor(private readonly repository: UserRepository) {}

  public async listUsers(session: AuthSessionResponse): Promise<UsersResponse> {
    const users = await this.repository.listByOrganization(session.user.organization.id);

    return {
      users: users.map(toUserSummary),
    };
  }
}

export const userService = new UserService(userRepository);
