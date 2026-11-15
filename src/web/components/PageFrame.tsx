import {Heading} from '@astryxdesign/core/Heading';
import {HStack} from '@astryxdesign/core/HStack';
import {Layout, LayoutContent, LayoutHeader} from '@astryxdesign/core/Layout';
import {StackItem} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import type {ReactNode} from 'react';

interface PageFrameProps {
  title: string;
  subtitle?: string;
  /** One primary action per screen (§2.1) — placed at the edge of the header. */
  action?: ReactNode;
  /** Maximum content width; text pages are narrower than tables. */
  contentWidth?: number;
  children: ReactNode;
}

/** The unified page frame: a header with an h1 title + scrollable content. Every Rasd page goes through here. */
export function PageFrame({title, subtitle, action, contentWidth = 1040, children}: PageFrameProps) {
  return (
    <Layout
      contentWidth={contentWidth}
      header={
        <LayoutHeader hasDivider padding={6}>
          <HStack gap={4} vAlign="center">
            <StackItem size="fill">
              <VStack gap={1}>
                <Heading level={1}>{title}</Heading>
                {subtitle ? (
                  <Text type="supporting" color="secondary">
                    {subtitle}
                  </Text>
                ) : null}
              </VStack>
            </StackItem>
            {action}
          </HStack>
        </LayoutHeader>
      }
      content={<LayoutContent padding={6}>{children}</LayoutContent>}
    />
  );
}
