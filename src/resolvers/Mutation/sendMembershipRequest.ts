import {
  MEMBERSHIP_REQUEST_ALREADY_EXISTS,
  ORGANIZATION_NOT_FOUND_ERROR,
  USER_NOT_FOUND_ERROR,
  USER_NOT_AUTHORIZED_ERROR,
  USER_ALREADY_MEMBER_ERROR,
} from "../../constants";
import type { MutationResolvers } from "../../types/generatedGraphQLTypes";
import { errors, requestContext } from "../../libraries";
import { User, MembershipRequest, Organization } from "../../models";
import { findOrganizationsInCache } from "../../services/OrganizationCache/findOrganizationsInCache";
import { cacheOrganizations } from "../../services/OrganizationCache/cacheOrganizations";
import mongoose from "mongoose";
/**
 * This function enables to send membership request.
 * @param _parent - parent of current request
 * @param args - payload provided with the request
 * @param context - context of entire application
 * @remarks The following checks are done:
 * 1. If the organization exists
 * 2. If the user exists.
 * 3. If the membership request already exists.
 * @returns Membership request.
 */
export const sendMembershipRequest: MutationResolvers["sendMembershipRequest"] =
  async (_parent, args, context) => {
    let organization;

    const organizationFoundInCache = await findOrganizationsInCache([
      args.organizationId,
    ]);

    organization = organizationFoundInCache[0];

    if (organizationFoundInCache[0] == null) {
      organization = await Organization.findOne({
        _id: args.organizationId,
      }).lean();

      if (organization !== null) {
        await cacheOrganizations([organization]);
      }
    }

    if (!organization) {
      throw new errors.NotFoundError(
        requestContext.translate(ORGANIZATION_NOT_FOUND_ERROR.MESSAGE),
        ORGANIZATION_NOT_FOUND_ERROR.CODE,
        ORGANIZATION_NOT_FOUND_ERROR.PARAM,
      );
    }

    const userExists = await User.exists({
      _id: context.userId,
    });

    console.log("User exists:", userExists);

    // Checks whether user exists.
    if (!userExists) {
      throw new errors.NotFoundError(
        requestContext.translate(USER_NOT_FOUND_ERROR.MESSAGE),
        USER_NOT_FOUND_ERROR.CODE,
        USER_NOT_FOUND_ERROR.PARAM,
      );
    }

    // Checks if the user is already a member of the organization
    const isMember = organization.members.some((member) =>
      new mongoose.Types.ObjectId(member.toString()).equals(context.userId),
    );

    if (isMember === true) {
      throw new errors.ConflictError(
        requestContext.translate(USER_ALREADY_MEMBER_ERROR.MESSAGE),
        USER_ALREADY_MEMBER_ERROR.CODE,
        USER_ALREADY_MEMBER_ERROR.PARAM,
      );
    }

    // Checks if the user is blocked

    const user = await User.findById(context.userId).lean();
    if (user === null) {
      throw new errors.NotFoundError(
        requestContext.translate(USER_NOT_FOUND_ERROR.MESSAGE),
        USER_NOT_FOUND_ERROR.CODE,
        USER_NOT_FOUND_ERROR.PARAM,
      );
    }

    if (
      organization.blockedUsers.some((blockedUser) =>
        new mongoose.Types.ObjectId(blockedUser.toString()).equals(user._id),
      )
    ) {
      console.log("User is blocked");
      throw new errors.UnauthorizedError(
        requestContext.translate(USER_NOT_AUTHORIZED_ERROR.MESSAGE),
        USER_NOT_AUTHORIZED_ERROR.CODE,
        USER_NOT_AUTHORIZED_ERROR.PARAM,
      );
    }

    // Checks if the membership request already exists
    const membershipRequestExists = await MembershipRequest.exists({
      user: context.userId,
      organization: organization._id,
    });

    // console.log("Membership request already exists:", membershipRequestExists);

    if (membershipRequestExists) {
      // Check if the request is already in the user's document
      if (!user.membershipRequests.includes(membershipRequestExists._id)) {
        // If it's not in the user's document, add it
        await User.findByIdAndUpdate(
          context.userId,
          {
            $push: {
              membershipRequests: membershipRequestExists._id,
            },
          },
          { new: true, runValidators: true },
        );
        console.log("Added existing membership request to user's document");
      }

      throw new errors.ConflictError(
        requestContext.translate(MEMBERSHIP_REQUEST_ALREADY_EXISTS.MESSAGE),
        MEMBERSHIP_REQUEST_ALREADY_EXISTS.CODE,
        MEMBERSHIP_REQUEST_ALREADY_EXISTS.PARAM,
      );
    }

    // Creating Membership Request
    const createdMembershipRequest = await MembershipRequest.create({
      user: context.userId,
      organization: organization._id,
    });

    // Updating Membership Request in organization
    const updatedOrganization = await Organization.findOneAndUpdate(
      {
        _id: organization._id,
      },
      {
        $push: {
          membershipRequests: createdMembershipRequest._id,
        },
      },
      {
        new: true,
      },
    ).lean();

    if (updatedOrganization !== null) {
      await cacheOrganizations([updatedOrganization]);
    }

    // Updating User
    const updateResult = await User.findByIdAndUpdate(
      context.userId,
      {
        $push: {
          membershipRequests: createdMembershipRequest._id,
        },
      },
      { new: true, runValidators: true },
    );

    if (!updateResult) {
      throw new Error("Failed to update user with membership request");
    }

    // Fetch the updated user to confirm the change
    const updatedUser = await User.findById(context.userId).lean();
    console.log("Updated user:", updatedUser);

    return createdMembershipRequest.toObject();
  };
