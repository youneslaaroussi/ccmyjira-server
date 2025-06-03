import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsEmail,
  IsObject,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PostmarkEmailAddressDto {
  @IsEmail()
  Email: string;

  @IsString()
  MailboxHash: string;

  @IsString()
  Name: string;
}

export class PostmarkAttachmentDto {
  @IsString()
  Name: string;

  @IsString()
  Content: string;

  @IsString()
  ContentType: string;

  @IsOptional()
  @IsString()
  ContentID?: string;

  @IsOptional()
  @IsNumber()
  ContentLength?: number;
}

export class PostmarkHeaderDto {
  @IsString()
  Name: string;

  @IsString()
  Value: string;
}

export class PostmarkWebhookDto {
  @IsOptional()
  @IsString()
  RecordType?: string; // May not be present in all webhooks

  @IsOptional()
  @IsString()
  MessageID?: string;

  @IsOptional()
  @IsString() // Accept RFC 2822 date format from Postmark
  Date?: string;

  @IsOptional()
  @IsString()
  Subject?: string;

  @IsOptional()
  @IsEmail()
  From?: string;

  @IsOptional()
  @IsString()
  FromName?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PostmarkEmailAddressDto)
  FromFull?: PostmarkEmailAddressDto;

  @IsOptional()
  @IsString()
  To?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PostmarkEmailAddressDto)
  ToFull?: PostmarkEmailAddressDto[];

  @IsOptional()
  @IsString()
  Cc?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PostmarkEmailAddressDto)
  CcFull?: PostmarkEmailAddressDto[];

  @IsOptional()
  @IsString()
  Bcc?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PostmarkEmailAddressDto)
  BccFull?: PostmarkEmailAddressDto[];

  @IsOptional()
  @IsString()
  ReplyTo?: string;

  @IsOptional()
  @IsString()
  MailboxHash?: string;

  @IsOptional()
  @IsString()
  TextBody?: string;

  @IsOptional()
  @IsString()
  HtmlBody?: string;

  @IsOptional()
  @IsString()
  StrippedTextReply?: string;

  @IsOptional()
  @IsString()
  Tag?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PostmarkHeaderDto)
  Headers?: PostmarkHeaderDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PostmarkAttachmentDto)
  Attachments?: PostmarkAttachmentDto[];

  @IsOptional()
  @IsString()
  MessageStream?: string;

  @IsOptional()
  @IsString()
  RawEmail?: string;

  @IsOptional()
  @IsString()
  OriginalRecipient?: string;
}
