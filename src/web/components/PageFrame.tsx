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
  /** إجراء واحد أساسي لكل شاشة (§2.1) — يوضع في طرف الترويسة. */
  action?: ReactNode;
  /** عرض المحتوى الأقصى؛ الصفحات النصية أضيق من الجداول. */
  contentWidth?: number;
  children: ReactNode;
}

/** إطار الصفحة الموحّد: ترويسة بعنوان h1 + محتوى قابل للتمرير. كل صفحات رَصد تمرّ من هنا. */
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
